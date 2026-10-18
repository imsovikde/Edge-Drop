/**
 * Split-Plane Storage & Real-Time Sync Engine for Edge-Drop.
 *
 * Responsibilities:
 *   - Kernel-optimized Two-Phase Commit (2PC) for binary blob integrity.
 *   - Metadata Plane: Direct authenticated Firestore REST API to /users/{userId}/items/{itemId}.
 *   - Blob Plane: Binary upload to Firestore Blob document store (/users/{userId}/blobs/{sha256}) with SHA-256 deduplication.
 *   - Settings Plane: Synchronizes user preferences to /users/{userId}/config/settings.
 *   - Downlink: Real-time pull reconciliation with cryptographic SHA-256 validation.
 *   - Write-Ahead Log (WAL) & adaptive delta coalescing via AdaptiveGovernor.
 */
import { existsSync, readFileSync } from 'node:fs'
import { powerMonitor } from 'electron'
import { getActiveFirebaseConfig } from './firebaseConfig'
import { authManager } from './authManager'
import { adaptiveGovernor, WalEntry, type SyncResult } from './adaptiveGovernor'
import { atomicWriteFileSync, computeSha256, sanitizeSafePath } from './cryptoIntegrity'
import { syncWorker } from './syncWorker'
import { ClipboardItem, CloudSyncState, CloudSyncStatus, Settings } from '../../shared/types'
import { getStore, loadSettings, saveSettings, pushState } from '../main/state'
import { PATHS } from '../store/paths'

const SYNC_INTERVAL_AC_MS = 20_000
const SYNC_INTERVAL_BATTERY_MS = 300_000

function toFsValue(v: any): any {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return { integerValue: v.toString() }
    return { doubleValue: v }
  }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFsValue) } }
  }
  if (typeof v === 'object') {
    const fields: Record<string, any> = {}
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined) {
        fields[k] = toFsValue(val)
      }
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(v) }
}

function fromFsValue(fv: any): any {
  if (!fv) return null
  if ('nullValue' in fv) return null
  if ('booleanValue' in fv) return fv.booleanValue
  if ('integerValue' in fv) return parseInt(fv.integerValue, 10)
  if ('doubleValue' in fv) return fv.doubleValue
  if ('stringValue' in fv) return fv.stringValue
  if ('mapValue' in fv) {
    const res: Record<string, any> = {}
    const fields = fv.mapValue.fields || {}
    for (const [k, v] of Object.entries(fields)) {
      res[k] = fromFsValue(v)
    }
    return res
  }
  if ('arrayValue' in fv) {
    return (fv.arrayValue.values || []).map(fromFsValue)
  }
  return null
}

function toFsDoc(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFsValue(v)
    }
  }
  return fields
}

function fromFsDoc(fields: Record<string, any>): Record<string, any> {
  const res: Record<string, any> = {}
  for (const [k, v] of Object.entries(fields || {})) {
    res[k] = fromFsValue(v)
  }
  return res
}

function extractFriendlyFirestoreError(status: number, rawText: string): string {
  if (status === 403) {
    return 'Permission denied (403): Firestore security rules rejected access. Verify rules in Firebase Console.'
  }
  if (status === 401) {
    return 'Authentication expired (401): Please re-authenticate your Cloud Vault.'
  }
  if (status === 400) {
    try {
      const parsed = JSON.parse(rawText)
      if (parsed.error?.message) {
        return `Firestore rejected document (400): ${parsed.error.message}`
      }
    } catch {}
    return `Firestore Bad Request (400): ${rawText.slice(0, 120)}`
  }
  try {
    const parsed = JSON.parse(rawText)
    if (parsed.error?.message) {
      return `Firestore error (${status}): ${parsed.error.message}`
    }
  } catch {}
  return `Firestore HTTP ${status}: ${rawText.slice(0, 120)}`
}

class SyncEngine {
  private static uploadedBlobs: Map<string, string> = new Map()
  private status: CloudSyncStatus = 'idle'
  private lastSyncedAt: number | null = null
  private lastError: string | null = null
  private lastLatencyMs: number | null = null
  private cloudItemCount = 0
  private pollInterval: NodeJS.Timeout | null = null
  private isSyncing = false
  private listeners: Set<(state: CloudSyncState) => void> = new Set()
  private lastSyncCursor: number = 0
  private isPowerMonitoring = false
  private currentIntervalMs = SYNC_INTERVAL_AC_MS

  public init(): void {
    this.setupPowerMonitor()

    adaptiveGovernor.init(async (entries) => {
      return await this.processWalEntries(entries)
    })

    authManager.onAuthStateChanged((user) => {
      if (user) {
        this.startBackgroundSync(user.uid)
        void this.triggerSync()
      } else {
        this.stopBackgroundSync()
        this.setStatus('idle')
      }
    })
  }

  public getState(): CloudSyncState {
    return {
      status: this.status,
      lastSyncedAt: this.lastSyncedAt,
      error: this.lastError,
      pendingMutations: adaptiveGovernor.getPendingCount(),
      user: authManager.getCurrentUser(),
      latencyMs: this.lastLatencyMs ?? undefined,
      cloudItemCount: this.cloudItemCount
    }
  }

  public onStateChanged(cb: (state: CloudSyncState) => void): () => void {
    this.listeners.add(cb)
    cb(this.getState())
    return () => this.listeners.delete(cb)
  }

  private setStatus(status: CloudSyncStatus, error: string | null = null): void {
    this.status = status
    this.lastError = error
    const state = this.getState()
    for (const cb of this.listeners) {
      try {
        cb(state)
      } catch (err) {
        console.error('[SyncEngine] listener error:', err)
      }
    }
  }

  public queueUpsert(item: ClipboardItem): void {
    adaptiveGovernor.queueItem(item, 'upsert')
    this.notifyStateChanged()
  }

  public queueDelete(item: ClipboardItem): void {
    adaptiveGovernor.queueItem(item, 'delete')
    this.notifyStateChanged()
  }

  public queueSettings(patch: Partial<Settings>): void {
    adaptiveGovernor.queueSettings(patch)
    this.notifyStateChanged()
  }

  private notifyStateChanged(): void {
    const state = this.getState()
    for (const cb of this.listeners) {
      try { cb(state) } catch { /* ignore */ }
    }
  }

  private async fetchFirestore(path: string, options: RequestInit = {}): Promise<Response> {
    const config = getActiveFirebaseConfig()
    if (!config?.projectId) throw new Error('Firestore project ID is missing')

    const token = await authManager.getFreshIdToken()
    if (!token) throw new Error('Unauthenticated: No active Firebase ID token available')

    const cleanPath = path.startsWith('/') ? path.slice(1) : path
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/${cleanPath}`

    const headers = new Headers(options.headers || {})
    headers.set('Authorization', `Bearer ${token}`)
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    return fetch(url, { ...options, headers, signal: options.signal || AbortSignal.timeout(15_000) })
  }

  public async triggerSync(): Promise<void> {
    const user = authManager.getCurrentUser()
    const config = getActiveFirebaseConfig()

    if (!user || !config?.apiKey) {
      this.setStatus('idle')
      return
    }

    if (this.isSyncing) return
    this.isSyncing = true
    this.setStatus('syncing')
    const startSyncMs = Date.now()

    try {
      // 1. Flush local write-ahead log mutations
      await adaptiveGovernor.flushNow()

      // 2. Commit current local settings to cloud
      const currentSettings = loadSettings()
      const cleanSettings = { ...currentSettings, updatedAt: Date.now() }
      const settingsRes = await this.fetchFirestore(`users/${encodeURIComponent(user.uid)}/config/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: toFsDoc(cleanSettings) })
      })

      if (!settingsRes.ok) {
        const errText = await settingsRes.text()
        throw new Error(`Settings push failed: HTTP ${settingsRes.status} - ${errText}`)
      }

      // 3. Pull remote changes from cloud
      await this.pullRemoteData(user.uid)

      this.lastLatencyMs = Date.now() - startSyncMs
      this.lastSyncedAt = Date.now()
      this.setStatus('success')
    } catch (err: any) {
      console.error('[SyncEngine] Sync failed:', err)
      this.setStatus('error', err?.message || 'Sync failed')
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Upload binary buffer to Firestore blobs, splitting into chunks if > 700KB
   * to strictly obey Firestore's 1MB document limit.
   */
  private async uploadBlob(userId: string, buf: Buffer, expectedSha?: string): Promise<string> {
    const sha256 = expectedSha || syncWorker.hashBuffer(buf)
    if (SyncEngine.uploadedBlobs.has(sha256)) return sha256

    const b64 = buf.toString('base64')
    const CHUNK_SIZE = 700_000

    if (b64.length > CHUNK_SIZE) {
      const chunkCount = Math.ceil(b64.length / CHUNK_SIZE)
      const parentRes = await this.fetchFirestore(
        `users/${encodeURIComponent(userId)}/blobs/${encodeURIComponent(sha256)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            fields: toFsDoc({
              sha256,
              isChunked: true,
              chunkCount,
              sizeBytes: buf.length,
              createdAt: Date.now()
            })
          })
        }
      )
      if (!parentRes.ok) {
        const errText = await parentRes.text()
        throw new Error(`Failed to upload parent blob: HTTP ${parentRes.status} - ${errText}`)
      }

      const chunkPromises = Array.from({ length: chunkCount }, async (_, i) => {
        const chunkData = b64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        const chunkRes = await this.fetchFirestore(
          `users/${encodeURIComponent(userId)}/blobs/${encodeURIComponent(sha256)}/chunks/${i}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              fields: toFsDoc({
                chunkIndex: i,
                data: chunkData
              })
            })
          }
        )
        if (!chunkRes.ok) {
          const errText = await chunkRes.text()
          throw new Error(`Failed to upload chunk ${i}: HTTP ${chunkRes.status} - ${errText}`)
        }
      })
      await Promise.all(chunkPromises)
    } else {
      const blobRes = await this.fetchFirestore(
        `users/${encodeURIComponent(userId)}/blobs/${encodeURIComponent(sha256)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            fields: toFsDoc({
              sha256,
              isChunked: false,
              base64: b64,
              sizeBytes: buf.length,
              createdAt: Date.now()
            })
          })
        }
      )
      if (!blobRes.ok) {
        const errText = await blobRes.text()
        throw new Error(`Failed to upload blob: HTTP ${blobRes.status} - ${errText}`)
      }
    }

    SyncEngine.uploadedBlobs.set(sha256, '')
    return sha256
  }

  /**
   * Hydrate binary buffer from Firestore blobs, reassembling chunks in parallel if chunked.
   */
  private async downloadBlob(userId: string, sha256: string): Promise<Buffer | null> {
    try {
      const blobRes = await this.fetchFirestore(
        `users/${encodeURIComponent(userId)}/blobs/${encodeURIComponent(sha256)}`,
        { method: 'GET' }
      )
      if (!blobRes.ok) return null
      const blobDoc = (await blobRes.json()) as any
      if (!blobDoc?.fields) return null

      const isChunked = blobDoc.fields.isChunked?.booleanValue === true
      if (isChunked) {
        const chunkCount = parseInt(blobDoc.fields.chunkCount?.integerValue || '1', 10)
        const chunkPromises = Array.from({ length: chunkCount }, async (_, i) => {
          const res = await this.fetchFirestore(
            `users/${encodeURIComponent(userId)}/blobs/${encodeURIComponent(sha256)}/chunks/${i}`,
            { method: 'GET' }
          )
          if (!res.ok) throw new Error(`Chunk ${i} download failed`)
          const doc = (await res.json()) as any
          return doc?.fields?.data?.stringValue || ''
        })
        const chunks = await Promise.all(chunkPromises)
        const fullB64 = chunks.join('')
        const buf = Buffer.from(fullB64, 'base64')
        if (computeSha256(buf) === sha256) {
          return buf
        }
      } else {
        const b64 = blobDoc.fields.base64?.stringValue
        if (b64) {
          const buf = Buffer.from(b64, 'base64')
          if (computeSha256(buf) === sha256) {
            return buf
          }
        }
      }
    } catch (err) {
      console.warn(`[SyncEngine] downloadBlob error for ${sha256}:`, err)
    }
    return null
  }

  /**
   * Process a single WAL entry against Firestore.
   */
  private async processSingleWalEntry(userId: string, entry: WalEntry): Promise<void> {
    if (entry.action === 'settings' && entry.settings) {
      const cleanSettings = { ...entry.settings, updatedAt: entry.timestamp }
      const res = await this.fetchFirestore(`users/${encodeURIComponent(userId)}/config/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: toFsDoc(cleanSettings) })
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(extractFriendlyFirestoreError(res.status, errText))
      }
      return
    }

    if (!entry.item) return

    if (entry.action === 'delete') {
      const res = await this.fetchFirestore(
        `users/${encodeURIComponent(userId)}/items/${encodeURIComponent(entry.item.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            fields: toFsDoc({
              id: entry.item.id,
              deletedAt: entry.timestamp,
              updatedAt: entry.timestamp
            })
          })
        }
      )
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(extractFriendlyFirestoreError(res.status, errText))
      }
    } else {
      let sanitizedData: any = { ...entry.item.data }

      // Full text payload extraction & automatic blob offloading for payloads > 500KB
      if (entry.item.data.kind === 'text') {
        let fullText: string | null = null
        if (entry.item.data.hasFullPayload) {
          fullText = getStore().getFullText(entry.item.id)
        }
        if (!fullText) {
          fullText = entry.item.data.text || ''
        }

        const byteLen = Buffer.byteLength(fullText, 'utf-8')
        if (byteLen > 250_000) {
          try {
            const textBuf = Buffer.from(fullText, 'utf-8')
            const sha256 = await this.uploadBlob(userId, textBuf)
            sanitizedData = {
              ...sanitizedData,
              isTextBlob: true,
              textBlobSha256: sha256,
              previewText: fullText.slice(0, 300),
              text: fullText.slice(0, 300)
            }
            delete sanitizedData.fullText
          } catch (err) {
            console.warn('[SyncEngine] Text blob upload error:', err)
            sanitizedData.fullText = fullText.slice(0, 250_000)
          }
        } else {
          sanitizedData.fullText = fullText
        }
      }

      // Two-Phase Commit (2PC) for Binary Image Blobs with Deduplication
      if (entry.item.data.kind === 'image') {
        const itemSha256 = (entry.item.data as any).sha256
        const imagePath = PATHS.imageFile(entry.item.data.imageId)

        if (existsSync(imagePath)) {
          try {
            const imgBuf = readFileSync(imagePath)
            const sha256 = await this.uploadBlob(userId, imgBuf, itemSha256)
            sanitizedData = { ...sanitizedData, sha256 }
          } catch (err) {
            console.warn('[SyncEngine] Blob processing error:', err)
          }
        }
      }

      // Two-Phase Commit (2PC) for Multi-Image Collections
      if (entry.item.data.kind === 'image-collection' && Array.isArray(entry.item.data.images)) {
        const imagesWithSha: any[] = []
        for (const img of entry.item.data.images) {
          const imgPath = PATHS.imageFile(img.imageId)
          if (existsSync(imgPath)) {
            try {
              const imgBuf = readFileSync(imgPath)
              const sha256 = await this.uploadBlob(userId, imgBuf, (img as any).sha256)
              imagesWithSha.push({ ...img, sha256 })
            } catch {
              imagesWithSha.push(img)
            }
          } else {
            imagesWithSha.push(img)
          }
        }
        sanitizedData = { ...sanitizedData, images: imagesWithSha }
      }

      const res = await this.fetchFirestore(
        `users/${encodeURIComponent(userId)}/items/${encodeURIComponent(entry.item.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            fields: toFsDoc({
              id: entry.item.id,
              data: sanitizedData,
              capturedAt: entry.item.capturedAt,
              hitCount: entry.item.hitCount,
              pinned: entry.item.pinned,
              tags: entry.item.tags || [],
              colorTag: entry.item.colorTag || null,
              updatedAt: entry.timestamp,
              deletedAt: null
            })
          })
        }
      )
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(extractFriendlyFirestoreError(res.status, errText))
      }
    }
  }

  /**
   * Process batched WAL entries with Two-Phase Commit (2PC) and concurrent batching.
   */
  private async processWalEntries(entries: WalEntry[]): Promise<SyncResult> {
    const user = authManager.getCurrentUser()
    if (!user) return { succeededIds: [], failedIds: [] }

    const succeededIds: string[] = []
    const failedIds: string[] = []
    let firstError: string | undefined

    const BATCH_SIZE = 4
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (entry) => {
          await this.processSingleWalEntry(user.uid, entry)
          return entry.id
        })
      )

      for (let j = 0; j < results.length; j++) {
        const res = results[j]
        const entry = batch[j]
        if (res.status === 'fulfilled') {
          succeededIds.push(entry.id)
        } else {
          failedIds.push(entry.id)
          const reason = res.reason
          const msg = reason?.message || String(reason)
          if (!firstError) firstError = msg
          console.warn(`[SyncEngine] WAL entry failed (${entry.id}):`, msg)
        }
      }
    }

    return {
      succeededIds,
      failedIds,
      error: firstError
    }
  }

  private async pullRemoteData(userId: string): Promise<void> {
    const MACHINE_LOCAL_KEYS: (keyof Settings)[] = [
      'stickDisplayId',
      'stickDisplayWorkArea',
      'stickDisplayScaleFactor',
      'customFirebaseConfig'
    ]

    // 1. Pull Settings (Preserving machine-local display geometry and custom DB override)
    try {
      const settingsRes = await this.fetchFirestore(`users/${encodeURIComponent(userId)}/config/settings`, {
        method: 'GET'
      })
      if (settingsRes.ok) {
        const settingsDoc = (await settingsRes.json()) as any
        if (settingsDoc?.fields) {
          const remoteSettings = fromFsDoc(settingsDoc.fields)
          const currentSettings = loadSettings()
          const { updatedAt, ...cleanRemote } = remoteSettings

          const mergedSettings: Record<string, any> = { ...cleanRemote }
          for (const key of MACHINE_LOCAL_KEYS) {
            if (currentSettings[key] !== undefined) {
              mergedSettings[key] = currentSettings[key]
            } else {
              delete mergedSettings[key]
            }
          }
          saveSettings(mergedSettings as Settings)
          pushState.settings(loadSettings())
        }
      }
    } catch (err) {
      console.warn('[SyncEngine] Remote settings pull warning:', err)
    }

    // 2. Pull Items
    try {
      const itemsRes = await this.fetchFirestore(
        `users/${encodeURIComponent(userId)}/items?pageSize=300`,
        { method: 'GET' }
      )
      if (itemsRes.ok) {
        const listData = (await itemsRes.json()) as any
        const documents: any[] = listData?.documents || []
        this.cloudItemCount = documents.length
        const store = getStore()
        let localModified = false
        const remoteIds = new Set<string>()

        const syncStartTime = Date.now()
        for (const docObj of documents) {
          if (!docObj?.fields) continue
          const data = fromFsDoc(docObj.fields)
          if (!data || !data.id) continue
          remoteIds.add(data.id)

          // Kernel delta cursor optimization: if item was updated prior to lastSyncCursor and is already present locally,
          // skip full payload parsing and blob hydration to minimize CPU and power draw
          const itemUpdatedAt = data.updatedAt || data.capturedAt || 0
          if (this.lastSyncCursor > 0 && itemUpdatedAt < this.lastSyncCursor - 3000 && store.hasItem(data.id)) {
            continue
          }

          if (data.deletedAt) {
            if (store.hasItem(data.id)) {
              store.deleteItem(data.id)
              localModified = true
            }
          } else if (data.data) {
            // Full text payload hydration (inline string or chunked Firestore blob)
            if (data.data.kind === 'text') {
              if (data.data.isTextBlob && data.data.textBlobSha256) {
                try {
                  const buf = await this.downloadBlob(userId, data.data.textBlobSha256)
                  if (buf) {
                    const fullText = buf.toString('utf-8')
                    store.writeTextPayload(data.id, fullText)
                    data.data.hasFullPayload = true
                    data.data.previewText = fullText.slice(0, 300)
                    data.data.text = data.data.previewText
                  }
                } catch (err) {
                  console.warn('[SyncEngine] Text blob hydration warning:', err)
                }
              } else if (data.data.fullText && typeof data.data.fullText === 'string') {
                store.writeTextPayload(data.id, data.data.fullText)
                data.data.hasFullPayload = true
                data.data.previewText = data.data.fullText.slice(0, 300)
                data.data.text = data.data.previewText
                delete data.data.fullText
              }
            }

            // Cryptographically verified image hydration
            if (data.data.kind === 'image' && data.data.imageId && data.data.sha256) {
              const cleanImageId = sanitizeSafePath(PATHS.imagesDir(), `${data.data.imageId}.png`)
              if (!existsSync(cleanImageId)) {
                try {
                  const buf = await this.downloadBlob(userId, data.data.sha256)
                  if (buf) {
                    atomicWriteFileSync(cleanImageId, buf)
                  }
                } catch (err) {
                  console.warn('[SyncEngine] Blob hydration warning:', err)
                }
              }
            }

            // Multi-image collection hydration
            if (data.data.kind === 'image-collection' && Array.isArray(data.data.images)) {
              for (const img of data.data.images) {
                if (img.imageId && img.sha256) {
                  const cleanImgPath = sanitizeSafePath(PATHS.imagesDir(), `${img.imageId}.png`)
                  if (!existsSync(cleanImgPath)) {
                    try {
                      const buf = await this.downloadBlob(userId, img.sha256)
                      if (buf) {
                        atomicWriteFileSync(cleanImgPath, buf)
                      }
                    } catch (err) {
                      console.warn('[SyncEngine] Collection image hydration warning:', err)
                    }
                  }
                }
              }
            }

            // Ingest remote item
            const remoteItem: ClipboardItem = {
              id: data.id,
              data: data.data,
              capturedAt: data.capturedAt || Date.now(),
              hitCount: data.hitCount || 1,
              pinned: !!data.pinned,
              tags: Array.isArray(data.tags) ? data.tags : undefined,
              colorTag: data.colorTag || undefined
            }

            if (store.upsertRemoteItem(remoteItem)) {
              localModified = true
            }
          }
        }

        // Backfill pre-existing local items not yet in remote cloud vault
        const localItems = store.list()
        for (const local of localItems) {
          if (!remoteIds.has(local.id)) {
            adaptiveGovernor.queueItem(local, 'upsert')
          }
        }

        this.lastSyncCursor = syncStartTime

        if (localModified) {
          pushState.items()
        }
      }
    } catch (err) {
      console.warn('[SyncEngine] Remote items pull warning:', err)
    }
  }

  private setupPowerMonitor(): void {
    if (this.isPowerMonitoring) return
    try {
      if (typeof powerMonitor?.on === 'function') {
        powerMonitor.on('on-battery', () => {
          this.rescheduleBackgroundSync(SYNC_INTERVAL_BATTERY_MS)
        })
        powerMonitor.on('on-ac', () => {
          this.rescheduleBackgroundSync(SYNC_INTERVAL_AC_MS)
          void this.triggerSync()
        })
        powerMonitor.on('suspend', () => {
          this.stopBackgroundSync()
        })
        powerMonitor.on('resume', () => {
          setTimeout(() => {
            this.rescheduleBackgroundSync()
            void this.triggerSync()
          }, 2500)
        })
        powerMonitor.on('unlock-screen', () => {
          void this.triggerSync()
        })
        this.isPowerMonitoring = true
      }
    } catch {
      /* ignore when electron powerMonitor is unmocked or in testing */
    }
  }

  public getEffectiveIntervalMs(): number {
    return this.currentIntervalMs
  }

  public getSyncCursor(): number {
    return this.lastSyncCursor
  }

  public setSyncCursor(cursor: number): void {
    this.lastSyncCursor = cursor
  }

  public rescheduleBackgroundSync(intervalMs?: number): void {
    if (intervalMs) {
      this.currentIntervalMs = intervalMs
    } else {
      let onBattery = false
      try {
        if (typeof powerMonitor?.isOnBatteryPower === 'function') {
          onBattery = powerMonitor.isOnBatteryPower()
        }
      } catch {
        /* ignore */
      }
      this.currentIntervalMs = onBattery ? SYNC_INTERVAL_BATTERY_MS : SYNC_INTERVAL_AC_MS
    }

    const user = authManager.getCurrentUser()
    if (!user) {
      this.stopBackgroundSync()
      return
    }

    this.stopBackgroundSync()
    this.pollInterval = setInterval(() => {
      void this.triggerSync()
    }, this.currentIntervalMs)
  }

  private startBackgroundSync(_userId?: string): void {
    this.rescheduleBackgroundSync()
  }

  private stopBackgroundSync(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  /**
   * Tear down all active timers and governor buffers cleanly.
   */
  public dispose(): void {
    this.stopBackgroundSync()
    adaptiveGovernor.dispose()
    this.listeners.clear()
    SyncEngine.uploadedBlobs.clear()
  }
}

export const syncEngine = new SyncEngine()
