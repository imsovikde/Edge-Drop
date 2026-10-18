import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ItemStore } from '../electron/store/ItemStore'
import { PATHS } from '../electron/store/paths'
import { syncEngine } from '../electron/backup/syncEngine'
import type { ClipboardItem } from '../shared/types'

describe('Epoch 8: Kernel-Level Delta/Cursor Sync, Power Throttling & Memory Caps', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ed-epoch8-'))
    vi.spyOn(PATHS, 'root').mockReturnValue(tempDir)
    vi.spyOn(PATHS, 'indexFile').mockReturnValue(join(tempDir, 'items.json'))
    vi.spyOn(PATHS, 'imagesDir').mockReturnValue(join(tempDir, 'images'))
    vi.spyOn(PATHS, 'payloadsDir').mockReturnValue(join(tempDir, 'payloads'))
    vi.spyOn(PATHS, 'imageFile').mockImplementation((id: string) => join(tempDir, 'images', `${id}.png`))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch { /* ignore */ }
  })

  describe('In-Memory Working Set & Blob Cap (ItemStore)', () => {
    it('enforces working set cap by evicting older unpinned payloads to disk', () => {
      const store = new ItemStore()

      // Add 10 unpinned items with short text
      for (let i = 0; i < 10; i++) {
        store.add({
          kind: 'text',
          text: `Item number ${i} payload data`,
          isUrl: false
        }, 50)
      }

      // Working set cap with threshold = 5
      store.enforceWorkingSetCap(5)

      const stats = store.getMemoryWorkingSetStats()
      expect(stats.total).toBe(10)
      expect(stats.pinned).toBe(0)
      // Items 6..10 (the oldest 5) should be disk-backed
      expect(stats.diskBacked).toBe(5)

      // Verify that getFullText transparently rehydrates evicted items
      const items = store.list()
      const oldestItem = items[items.length - 1]
      expect(oldestItem.data.kind === 'text' && oldestItem.data.hasFullPayload).toBe(true)
      expect(store.getFullText(oldestItem.id)).toBe('Item number 0 payload data')
    })

    it('protects pinned items from working set payload eviction', () => {
      const store = new ItemStore()

      // Add 3 pinned items
      for (let i = 0; i < 3; i++) {
        store.add({
          kind: 'text',
          text: `Pinned item ${i}`,
          isUrl: false
        }, 50)
        store.setPinned(store.list()[0].id, true)
      }

      // Add 4 unpinned items
      for (let i = 0; i < 4; i++) {
        store.add({
          kind: 'text',
          text: `Unpinned item ${i}`,
          isUrl: false
        }, 50)
      }

      // Enforce cap of 2 unpinned items
      store.enforceWorkingSetCap(2)

      const stats = store.getMemoryWorkingSetStats()
      expect(stats.pinned).toBe(3)
      // 4 unpinned total - 2 allowed in RAM = 2 evicted to disk
      expect(stats.diskBacked).toBe(2)

      // Verify pinned items still have original text in RAM without forced disk offloading
      const pinnedItems = store.list().filter((it) => it.pinned)
      for (const p of pinnedItems) {
        expect(p.data.kind === 'text' && p.data.hasFullPayload).toBeUndefined()
      }
    })

    it('transparently retrieves binary image buffers via getBlob', () => {
      const store = new ItemStore()
      const imgId = 'test-blob-123'
      const fakeBuffer = Buffer.from('FAKE_PNG_HEADER_DATA_12345')

      store.stageImageBytes(imgId, fakeBuffer)

      const item: ClipboardItem = {
        id: 'img-item-1',
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: false,
        data: {
          kind: 'image',
          imageId: imgId,
          width: 100,
          height: 100,
          bytes: fakeBuffer.length,
          ext: 'png'
        }
      }

      store.upsertRemoteItem(item)

      const retrievedBuf = store.getBlob('img-item-1')
      expect(retrievedBuf).not.toBeNull()
      expect(retrievedBuf!.toString()).toBe('FAKE_PNG_HEADER_DATA_12345')
    })
  })

  describe('Low-Power Delta Sync & Sync Cursor', () => {
    it('manages lastSyncCursor state for delta change detection', () => {
      expect(syncEngine.getSyncCursor()).toBe(0)
      const testTimestamp = 1792300000000
      syncEngine.setSyncCursor(testTimestamp)
      expect(syncEngine.getSyncCursor()).toBe(testTimestamp)
      syncEngine.setSyncCursor(0)
    })

    it('supports power-adaptive polling interval rescheduling', () => {
      // By default AC interval is 20,000ms
      expect(syncEngine.getEffectiveIntervalMs()).toBe(20000)

      // Test rescheduling to battery mode (300,000ms / 5 mins)
      syncEngine.rescheduleBackgroundSync(300000)
      expect(syncEngine.getEffectiveIntervalMs()).toBe(300000)

      // Test rescheduling back to AC mode
      syncEngine.rescheduleBackgroundSync(20000)
      expect(syncEngine.getEffectiveIntervalMs()).toBe(20000)
    })
  })
})
