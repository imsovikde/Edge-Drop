/**
 * Pre-Wipe Forensic Data Recovery & Automatic Migration Importer.
 *
 * Responsibilities:
 *   - Discovers surviving clipboard history from pre-wipe backups and ./recovery-staging/.
 *   - Auto-migrates items, images, and text payloads into the active ItemStore.
 *   - Queues restored items into the Cloud Sync Engine for lifetime Firebase persistence.
 */
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { ItemStore } from '../store/ItemStore'
import { PATHS } from '../store/paths'
import { ClipboardItem } from '../../shared/types'
import { syncEngine } from './syncEngine'

export function runRecoveryMigration(store: ItemStore): number {
  console.log('[RecoveryImporter] Scanning for pre-wipe recovery staging data...')

  const candidateDirs: string[] = [
    join(process.cwd(), 'recovery-staging'),
    join(app.getAppPath(), 'recovery-staging')
  ]

  try {
    const appData = app.getPath('appData')
    candidateDirs.push(join(appData, 'Edge-Drop-Staging'))
  } catch {
    /* ignore */
  }

  let stagingDir: string | null = null
  for (const dir of candidateDirs) {
    if (existsSync(join(dir, 'items.json'))) {
      stagingDir = dir
      break
    }
  }

  if (!stagingDir) {
    console.log('[RecoveryImporter] No recovery staging items.json found.')
    return 0
  }

  console.log(`[RecoveryImporter] Found recovery data in: ${stagingDir}`)
  let restoredCount = 0

  try {
    const rawBuffer = readFileSync(join(stagingDir, 'items.json'))
    const rawStr = rawBuffer.toString('utf8').trim()
    let itemsToRestore: ClipboardItem[] = []

    try {
      const parsed = JSON.parse(rawStr)
      if (parsed && parsed.encrypted && typeof parsed.payload === 'string') {
        if (safeStorage.isEncryptionAvailable()) {
          const decrypted = safeStorage.decryptString(Buffer.from(parsed.payload, 'base64'))
          itemsToRestore = JSON.parse(decrypted).items || []
        }
      } else if (parsed && Array.isArray(parsed.items)) {
        itemsToRestore = parsed.items
      }
    } catch (parseErr) {
      console.warn('[RecoveryImporter] Failed to parse staging items.json:', parseErr)
    }

    if (itemsToRestore.length === 0) {
      console.log('[RecoveryImporter] No items inside staging index.')
      return 0
    }

    // Ensure target directories exist
    const targetImagesDir = PATHS.imagesDir()
    const targetPayloadsDir = PATHS.payloadsDir()
    if (!existsSync(targetImagesDir)) mkdirSync(targetImagesDir, { recursive: true })
    if (!existsSync(targetPayloadsDir)) mkdirSync(targetPayloadsDir, { recursive: true })

    const stagingImages = join(stagingDir, 'images')
    const stagingPayloads = join(stagingDir, 'payloads')

    for (const item of itemsToRestore) {
      if (!item || !item.id || !item.data) continue

      // Only import if not already in store
      if (!store.hasItem(item.id)) {
        // Copy image files if applicable
        if (item.data.kind === 'image' && item.data.imageId) {
          const srcImg = join(stagingImages, `${item.data.imageId}.png`)
          const destImg = PATHS.imageFile(item.data.imageId)
          if (existsSync(srcImg) && !existsSync(destImg)) {
            try { copyFileSync(srcImg, destImg) } catch { /* ignore */ }
          }
        } else if (item.data.kind === 'image-collection' && Array.isArray(item.data.images)) {
          for (const img of item.data.images) {
            const srcImg = join(stagingImages, `${img.imageId}.png`)
            const destImg = PATHS.imageFile(img.imageId)
            if (existsSync(srcImg) && !existsSync(destImg)) {
              try { copyFileSync(srcImg, destImg) } catch { /* ignore */ }
            }
          }
        }

        // Copy text payloads if applicable
        if (item.data.kind === 'text' && item.data.hasFullPayload) {
          const srcPayload = join(stagingPayloads, `${item.id}.txt`)
          const destPayload = join(targetPayloadsDir, `${item.id}.txt`)
          if (existsSync(srcPayload) && !existsSync(destPayload)) {
            try { copyFileSync(srcPayload, destPayload) } catch { /* ignore */ }
          }
        }

        const inserted = store.upsertRemoteItem(item)
        if (inserted) {
          restoredCount++
          syncEngine.queueUpsert(item)
        }
      }
    }

    console.log(`[RecoveryImporter] Successfully restored and queued ${restoredCount} pre-wipe clipboard items!`)
  } catch (err) {
    console.error('[RecoveryImporter] Migration encountered an error:', err)
  }

  return restoredCount
}
