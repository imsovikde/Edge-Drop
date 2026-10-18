/**
 * Local Vault & Offline Snapshot Archive Engine (.edvault).
 *
 * Responsibilities:
 *   - 1-Click Export of all items, images, stacks, and settings into a single compressed .edvault archive.
 *   - 1-Click Import and atomic restoration of historical .edvault archives.
 *   - Optional local directory mirroring for OneDrive / NAS / Google Drive syncing.
 */
import { existsSync, readFileSync, readdirSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { join, basename } from 'node:path'
import { atomicWriteFileSync, computeSha256, sanitizeSafePath } from './cryptoIntegrity'
import { syncWorker } from './syncWorker'
import { PATHS } from '../store/paths'
import { getStore, loadSettings, saveSettings, pushState } from '../main/state'
import type { ClipboardItem, Settings, RollingBackupMetadata } from '../../shared/types'

export interface EdVaultArchive {
  magic: 'EDVAULT'
  version: 1 | 2
  exportedAt: number
  settings: Settings
  items: readonly ClipboardItem[]
  images: Record<string, string> // imageId -> base64 PNG
  payloads?: Record<string, string> // itemId -> fullText string
  sha256: string
}

export class LocalVault {
  /**
   * Export all current state into a single compressed .edvault file.
   */
  public async exportSnapshot(destFilePath: string): Promise<{ success: boolean; itemCount: number; imageCount: number; path: string }> {
    const store = getStore()
    const items = store.list()
    const settings = loadSettings()
    const images: Record<string, string> = {}
    const payloads: Record<string, string> = {}

    // Collect all full text payloads for text items
    for (const it of items) {
      if (it.data.kind === 'text' && it.data.hasFullPayload) {
        const full = store.getFullText(it.id)
        if (full) {
          payloads[it.id] = full
        }
      }
    }

    // Collect all stored images
    try {
      const dir = PATHS.imagesDir()
      if (existsSync(dir)) {
        const files = readdirSync(dir)
        for (const f of files) {
          if (f.endsWith('.png')) {
            const full = join(dir, f)
            const buf = readFileSync(full)
            images[f] = buf.toString('base64')
          }
        }
      }
    } catch (err) {
      console.warn('[LocalVault] error reading imagesDir:', err)
    }

    const payloadObj = {
      settings,
      items,
      images,
      payloads
    }
    const payloadStr = JSON.stringify(payloadObj)
    const contentSha256 = computeSha256(payloadStr)

    const archive: EdVaultArchive = {
      magic: 'EDVAULT',
      version: 2,
      exportedAt: Date.now(),
      settings,
      items,
      images,
      payloads,
      sha256: contentSha256
    }

    const jsonStr = JSON.stringify(archive)
    const compressed = await syncWorker.compressBuffer(jsonStr)

    atomicWriteFileSync(destFilePath, compressed)

    return {
      success: true,
      itemCount: items.length,
      imageCount: Object.keys(images).length,
      path: destFilePath
    }
  }

  /**
   * Import and restore an .edvault archive.
   */
  public async importSnapshot(srcFilePath: string): Promise<{ success: boolean; restoredItems: number; restoredImages: number }> {
    if (!existsSync(srcFilePath)) {
      throw new Error(`File does not exist: ${srcFilePath}`)
    }

    const rawCompressed = readFileSync(srcFilePath)
    const decompressed = await syncWorker.decompressBuffer(rawCompressed)
    const archive: EdVaultArchive = JSON.parse(decompressed.toString('utf8'))

    if (archive.magic !== 'EDVAULT') {
      throw new Error('Invalid archive format: missing EDVAULT header')
    }

    if (!Array.isArray(archive.items)) {
      throw new Error('Corrupted archive: items payload missing')
    }

    // Ensure images directory exists
    const dir = PATHS.imagesDir()
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // Restore binary images with strict path sanitization
    let restoredImages = 0
    if (archive.images && typeof archive.images === 'object') {
      for (const [filename, b64] of Object.entries(archive.images)) {
        try {
          const safeTarget = sanitizeSafePath(dir, filename)
          const imgBuf = Buffer.from(b64, 'base64')
          atomicWriteFileSync(safeTarget, imgBuf)
          restoredImages++
        } catch (err) {
          console.warn('[LocalVault] failed to restore image:', filename, err)
        }
      }
    }

    // Ingest items and payloads into ItemStore
    const store = getStore()

    // Restore full text payloads
    const payloadsDir = typeof PATHS?.payloadsDir === 'function' ? PATHS.payloadsDir() : join(PATHS.imagesDir(), '..', 'payloads')
    if (!existsSync(payloadsDir)) {
      mkdirSync(payloadsDir, { recursive: true })
    }
    if (archive.payloads && typeof archive.payloads === 'object') {
      for (const [id, fullText] of Object.entries(archive.payloads)) {
        if (typeof fullText === 'string') {
          store.writeTextPayload(id, fullText)
        }
      }
    }

    let restoredItems = 0
    for (const item of archive.items) {
      if (item && item.id && item.data) {
        store.upsertRemoteItem(item)
        restoredItems++
      }
    }

    // Restore settings if present
    if (archive.settings) {
      saveSettings(archive.settings)
    }

    pushState.items()
    pushState.settings(loadSettings())

    return {
      success: true,
      restoredItems,
      restoredImages
    }
  }

  /**
   * Create an automated rolling local backup in backupsDir and prune to maxKeep (default: 5).
   */
  public async createRollingBackup(): Promise<RollingBackupMetadata> {
    const dir = PATHS.backupsDir()
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const store = getStore()
    const count = store.list().length
    const timestamp = Date.now()
    const filename = `backup-${timestamp}-${count}items.edvault`
    const targetPath = join(dir, filename)

    const result = await this.exportSnapshot(targetPath)
    const stat = statSync(targetPath)

    await this.pruneRollingBackups(5)

    return {
      id: filename,
      timestamp,
      itemCount: result.itemCount,
      byteSize: stat.size,
      filename
    }
  }

  /**
   * List existing rolling backups ordered from newest to oldest.
   */
  public async listRollingBackups(): Promise<RollingBackupMetadata[]> {
    const dir = PATHS.backupsDir()
    if (!existsSync(dir)) return []

    const files = readdirSync(dir).filter((f) => f.endsWith('.edvault'))
    const list: RollingBackupMetadata[] = []

    for (const f of files) {
      try {
        const full = join(dir, f)
        const stat = statSync(full)
        const match = f.match(/^backup-(\d+)(?:-(\d+)items)?\.edvault$/)
        const timestamp = match ? parseInt(match[1], 10) : stat.mtimeMs
        const itemCount = match && match[2] ? parseInt(match[2], 10) : 0

        list.push({
          id: f,
          timestamp,
          itemCount,
          byteSize: stat.size,
          filename: f
        })
      } catch (err) {
        console.warn('[LocalVault] failed to stat rolling backup:', f, err)
      }
    }

    return list.sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Restore a rolling local backup by filename/id.
   */
  public async restoreRollingBackup(id: string): Promise<{ success: boolean; restoredItems: number; restoredImages: number }> {
    const dir = PATHS.backupsDir()
    const cleanName = basename(id)
    const targetPath = join(dir, cleanName)
    return this.importSnapshot(targetPath)
  }

  /**
   * Prune rolling backups in backupsDir to keep only the newest N files.
   */
  public async pruneRollingBackups(maxKeep = 5): Promise<void> {
    const dir = PATHS.backupsDir()
    if (!existsSync(dir)) return

    try {
      const files = readdirSync(dir)
        .filter((f) => f.endsWith('.edvault'))
        .map((f) => {
          const full = join(dir, f)
          const stat = statSync(full)
          const match = f.match(/^backup-(\d+)/)
          const timestamp = match ? parseInt(match[1], 10) : stat.mtimeMs
          return { filename: f, fullPath: full, timestamp }
        })
        .sort((a, b) => b.timestamp - a.timestamp)

      if (files.length > maxKeep) {
        const toDelete = files.slice(maxKeep)
        for (const item of toDelete) {
          try {
            unlinkSync(item.fullPath)
          } catch (err) {
            console.warn('[LocalVault] failed to delete old rolling backup:', item.filename, err)
          }
        }
      }
    } catch (err) {
      console.warn('[LocalVault] pruneRollingBackups error:', err)
    }
  }
}

export const localVault = new LocalVault()
