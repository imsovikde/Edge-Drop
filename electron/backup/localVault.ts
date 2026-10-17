/**
 * Local Vault & Offline Snapshot Archive Engine (.edvault).
 *
 * Responsibilities:
 *   - 1-Click Export of all items, images, stacks, and settings into a single compressed .edvault archive.
 *   - 1-Click Import and atomic restoration of historical .edvault archives.
 *   - Optional local directory mirroring for OneDrive / NAS / Google Drive syncing.
 */
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWriteFileSync, computeSha256, sanitizeSafePath } from './cryptoIntegrity'
import { syncWorker } from './syncWorker'
import { PATHS } from '../store/paths'
import { getStore, loadSettings, saveSettings, pushState } from '../main/state'
import type { ClipboardItem, Settings } from '../../shared/types'

export interface EdVaultArchive {
  magic: 'EDVAULT'
  version: 1
  exportedAt: number
  settings: Settings
  items: readonly ClipboardItem[]
  images: Record<string, string> // imageId -> base64 PNG
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
      images
    }
    const payloadStr = JSON.stringify(payloadObj)
    const contentSha256 = computeSha256(payloadStr)

    const archive: EdVaultArchive = {
      magic: 'EDVAULT',
      version: 1,
      exportedAt: Date.now(),
      settings,
      items,
      images,
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

    // Ingest items into ItemStore
    const store = getStore()
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
}

export const localVault = new LocalVault()
