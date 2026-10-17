/**
 * Split-Plane Storage & Real-Time Sync Engine for Edge-Drop.
 *
 * Responsibilities:
 *   - Offline-first resilient journal in userData/sync-journal.json.
 *   - Metadata Plane: Document sync to Firestore /users/{userId}/items/{itemId}.
 *   - Blob Plane: Binary upload to Firebase Storage or Firestore Blob document fallback.
 *   - Downlink: Real-time hydration listener via onSnapshot.
 *   - LWW (Last-Write-Wins) conflict resolution.
 */
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  getDoc,
  Unsubscribe
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getFirebaseFirestore, getFirebaseStorage } from './firebaseConfig'
import { authManager } from './authManager'
import { ClipboardItem, CloudSyncState, CloudSyncStatus } from '../../shared/types'
import { getStore, pushState } from '../main/state'
import { PATHS } from '../store/paths'

export interface SyncMutation {
  type: 'upsert' | 'delete'
  item: ClipboardItem
  timestamp: number
}

function getJournalFile(): string {
  try {
    return join(app.getPath('userData'), 'sync-journal.json')
  } catch {
    return join(process.cwd(), 'sync-journal.json')
  }
}

class SyncEngine {
  private journal: SyncMutation[] = []
  private status: CloudSyncStatus = 'idle'
  private lastSyncedAt: number | null = null
  private lastError: string | null = null
  private unsubscribeSnapshot: Unsubscribe | null = null
  private syncTimer: NodeJS.Timeout | null = null
  private isSyncing = false
  private listeners: Set<(state: CloudSyncState) => void> = new Set()

  public init(): void {
    this.loadJournal()

    authManager.onAuthStateChanged((user) => {
      if (user) {
        this.startRemoteListener(user.uid)
        this.triggerSync()
      } else {
        this.stopRemoteListener()
        this.setStatus('idle')
      }
    })
  }

  public getState(): CloudSyncState {
    return {
      status: this.status,
      lastSyncedAt: this.lastSyncedAt,
      error: this.lastError,
      pendingMutations: this.journal.length,
      user: authManager.getCurrentUser()
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

  private loadJournal(): void {
    try {
      const file = getJournalFile()
      if (existsSync(file)) {
        const raw = readFileSync(file, 'utf8')
        this.journal = JSON.parse(raw)
      }
    } catch {
      this.journal = []
    }
  }

  private saveJournal(): void {
    try {
      const file = getJournalFile()
      writeFileSync(file, JSON.stringify(this.journal), 'utf8')
    } catch (err) {
      console.warn('[SyncEngine] saveJournal failed:', err)
    }
  }

  public queueUpsert(item: ClipboardItem): void {
    const existingIdx = this.journal.findIndex((m) => m.item.id === item.id)
    const mutation: SyncMutation = { type: 'upsert', item, timestamp: Date.now() }
    if (existingIdx >= 0) {
      this.journal[existingIdx] = mutation
    } else {
      this.journal.push(mutation)
    }
    this.saveJournal()
    this.scheduleSync()
  }

  public queueDelete(item: ClipboardItem): void {
    const existingIdx = this.journal.findIndex((m) => m.item.id === item.id)
    const mutation: SyncMutation = { type: 'delete', item, timestamp: Date.now() }
    if (existingIdx >= 0) {
      this.journal[existingIdx] = mutation
    } else {
      this.journal.push(mutation)
    }
    this.saveJournal()
    this.scheduleSync()
  }

  public scheduleSync(delayMs = 1500): void {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      this.triggerSync()
    }, delayMs)
  }

  public async triggerSync(): Promise<void> {
    const user = authManager.getCurrentUser()
    const db = getFirebaseFirestore()

    if (!user || !db) {
      this.setStatus('idle')
      return
    }

    if (this.isSyncing) return
    this.isSyncing = true
    this.setStatus('syncing')

    try {
      const pending = [...this.journal]
      for (const mut of pending) {
        const itemRef = doc(db, 'users', user.uid, 'items', mut.item.id)

        if (mut.type === 'delete') {
          await setDoc(itemRef, {
            id: mut.item.id,
            deletedAt: mut.timestamp,
            updatedAt: mut.timestamp
          }, { merge: true })
        } else {
          let sanitizedData = { ...mut.item.data }

          // Binary Blob Handling for images
          if (mut.item.data.kind === 'image') {
            const imagePath = PATHS.imageFile(mut.item.data.imageId)
            if (existsSync(imagePath)) {
              try {
                const imgBuf = readFileSync(imagePath)
                const sha256 = createHash('sha256').update(imgBuf).digest('hex')
                const storage = getFirebaseStorage()

                if (storage) {
                  try {
                    const blobRef = ref(storage, `users/${user.uid}/blobs/${sha256}.png`)
                    await uploadBytes(blobRef, imgBuf, { contentType: 'image/png' })
                    const downloadUrl = await getDownloadURL(blobRef)
                    sanitizedData = { ...sanitizedData, downloadUrl, sha256 } as any
                  } catch {
                    // Fallback to storing in Firestore blob sub-collection if storage is disabled
                    const blobDocRef = doc(db, 'users', user.uid, 'blobs', sha256)
                    await setDoc(blobDocRef, {
                      sha256,
                      base64: imgBuf.toString('base64'),
                      createdAt: Date.now()
                    })
                    sanitizedData = { ...sanitizedData, sha256 } as any
                  }
                } else {
                  // Direct Firestore blob doc fallback
                  const blobDocRef = doc(db, 'users', user.uid, 'blobs', sha256)
                  await setDoc(blobDocRef, {
                    sha256,
                    base64: imgBuf.toString('base64'),
                    createdAt: Date.now()
                  })
                  sanitizedData = { ...sanitizedData, sha256 } as any
                }
              } catch (err) {
                console.warn('[SyncEngine] Blob processing error:', err)
              }
            }
          }

          await setDoc(itemRef, {
            id: mut.item.id,
            data: sanitizedData,
            capturedAt: mut.item.capturedAt,
            hitCount: mut.item.hitCount,
            pinned: mut.item.pinned,
            updatedAt: mut.timestamp,
            deletedAt: null
          })
        }

        // Remove from journal once successfully pushed
        this.journal = this.journal.filter((m) => m !== mut)
      }

      this.saveJournal()
      this.lastSyncedAt = Date.now()
      this.setStatus('success')
    } catch (err: any) {
      console.error('[SyncEngine] Sync failed:', err)
      this.setStatus('error', err?.message || 'Sync failed')
    } finally {
      this.isSyncing = false
    }
  }

  private startRemoteListener(userId: string): void {
    this.stopRemoteListener()
    const db = getFirebaseFirestore()
    if (!db) return

    const itemsCol = collection(db, 'users', userId, 'items')
    this.unsubscribeSnapshot = onSnapshot(itemsCol, async (snapshot) => {
      let localModified = false
      const store = getStore()

      for (const change of snapshot.docChanges()) {
        const data = change.doc.data()
        if (!data || !data.id) continue

        if (data.deletedAt) {
          // Remote Tombstone
          if (store.hasItem(data.id)) {
            store.deleteItem(data.id)
            localModified = true
          }
        } else if (data.data) {
          // Hydrate Image if missing locally
          if (data.data.kind === 'image' && data.data.imageId) {
            const imgPath = PATHS.imageFile(data.data.imageId)
            if (!existsSync(imgPath)) {
              if (data.data.downloadUrl) {
                try {
                  const res = await fetch(data.data.downloadUrl)
                  if (res.ok) {
                    const buf = Buffer.from(await res.arrayBuffer())
                    writeFileSync(imgPath, buf)
                  }
                } catch {
                  /* fallback */
                }
              } else if (data.data.sha256) {
                try {
                  const blobDoc = await getDoc(doc(db, 'users', userId, 'blobs', data.data.sha256))
                  if (blobDoc.exists() && blobDoc.data()?.base64) {
                    writeFileSync(imgPath, Buffer.from(blobDoc.data()!.base64, 'base64'))
                  }
                } catch {
                  /* ignore */
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
            pinned: !!data.pinned
          }

          if (store.upsertRemoteItem(remoteItem)) {
            localModified = true
          }
        }
      }

      if (localModified) {
        pushState.items()
      }
    }, (err) => {
      console.warn('[SyncEngine] remote listener error:', err)
    })
  }

  private stopRemoteListener(): void {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot()
      this.unsubscribeSnapshot = null
    }
  }
}

export const syncEngine = new SyncEngine()
