import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ItemStore } from '../electron/store/ItemStore'
import { PATHS } from '../electron/store/paths'
import { localVault } from '../electron/backup/localVault'
import * as stateModule from '../electron/main/state'
import type { ClipboardItem, ItemData, Settings } from '../shared/types'

describe('Epoch 1: Clipboard Item Access, Sorting & Cloud Vault Integrity', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ed-epoch1-'))
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

  it('preserves 100% of large text payload (>300 chars) via writeTextPayload and getFullText', () => {
    const store = new ItemStore()
    const longText = 'A'.repeat(5000)

    const added = store.add({
      kind: 'text',
      text: longText,
      isUrl: false
    }, 50)

    expect(added).toBe(true)
    const list = store.list()
    expect(list.length).toBe(1)
    const item = list[0]

    // In-memory preview is truncated to 300 chars
    expect(item.data.kind === 'text' && item.data.text.length).toBe(300)
    expect(item.data.kind === 'text' && item.data.hasFullPayload).toBe(true)
    expect(item.data.kind === 'text' && item.data.previewText?.length).toBe(300)

    // Full text is accurately read back from disk
    const retrieved = store.getFullText(item.id)
    expect(retrieved).toBe(longText)
    expect(retrieved.length).toBe(5000)
  })

  it('upsertRemoteItem extracts fullText payload, writes payload file, and updates item preview', () => {
    const store = new ItemStore()
    const longContent = 'RemoteTextPayload-'.repeat(200)

    const remoteItem: ClipboardItem = {
      id: 'remote-item-1',
      capturedAt: Date.now() - 5000,
      hitCount: 3,
      pinned: true,
      data: {
        kind: 'text',
        text: longContent.slice(0, 300),
        fullText: longContent,
        isUrl: false,
        hasFullPayload: true
      } as any
    }

    const modified = store.upsertRemoteItem(remoteItem)
    expect(modified).toBe(true)

    const item = store.get('remote-item-1')
    expect(item).toBeDefined()
    expect(item?.pinned).toBe(true)
    expect(item?.data.kind === 'text' && item.data.text.length).toBe(300)
    expect(item?.data.kind === 'text' && (item.data as any).fullText).toBeUndefined()

    // Full text is readable through getFullText
    expect(store.getFullText('remote-item-1')).toBe(longContent)
  })

  it('upsertRemoteItem prevents infinite re-render loops by returning false for identical items', () => {
    const store = new ItemStore()
    const now = Date.now()
    const item: ClipboardItem = {
      id: 'stable-1',
      capturedAt: now,
      hitCount: 1,
      pinned: false,
      data: { kind: 'text', text: 'Hello World', isUrl: false }
    }

    // First insert returns true
    expect(store.upsertRemoteItem(item)).toBe(true)

    // Second upsert with identical content, hitCount, pinned, and capturedAt returns false (no-op)
    expect(store.upsertRemoteItem(item)).toBe(false)
  })

  it('upsertRemoteItem maintains strict chronological sorting (newest capturedAt first)', () => {
    const store = new ItemStore()
    const t1 = 1000
    const t2 = 2000
    const t3 = 3000

    // Feed in out-of-order (e.g. alphabetical Firestore document order)
    store.upsertRemoteItem({
      id: 'c-alpha',
      capturedAt: t1,
      hitCount: 1,
      pinned: false,
      data: { kind: 'text', text: 'Oldest', isUrl: false }
    })

    store.upsertRemoteItem({
      id: 'a-alpha',
      capturedAt: t3,
      hitCount: 1,
      pinned: false,
      data: { kind: 'text', text: 'Newest', isUrl: false }
    })

    store.upsertRemoteItem({
      id: 'b-alpha',
      capturedAt: t2,
      hitCount: 1,
      pinned: false,
      data: { kind: 'text', text: 'Middle', isUrl: false }
    })

    const list = store.list()
    expect(list.map((x) => x.id)).toEqual(['a-alpha', 'b-alpha', 'c-alpha'])
    expect(list[0].capturedAt).toBe(t3)
    expect(list[1].capturedAt).toBe(t2)
    expect(list[2].capturedAt).toBe(t1)
  })

  it('LocalVault exports and imports .edvault archives with full text payloads intact', async () => {
    const store = new ItemStore()
    const longArticle = 'LongArticleParagraph-'.repeat(300)
    store.add({ kind: 'text', text: longArticle, isUrl: false }, 50)
    const originalItem = store.list()[0]

    vi.spyOn(stateModule, 'getStore').mockReturnValue(store)
    let savedSettings: any = {}
    vi.spyOn(stateModule, 'loadSettings').mockReturnValue({ hotZoneHeight: 0.4 } as any)
    vi.spyOn(stateModule, 'saveSettings').mockImplementation((s) => { savedSettings = s })
    vi.spyOn(stateModule, 'pushState', 'get').mockReturnValue({
      items: vi.fn(),
      settings: vi.fn(),
      activeFilter: vi.fn()
    } as any)

    const vaultPath = join(tempDir, 'snapshot.edvault')
    const exportRes = await localVault.exportSnapshot(vaultPath)
    expect(exportRes.success).toBe(true)
    expect(existsSync(vaultPath)).toBe(true)

    // Clear the store and delete payload file
    store.clearUnpinned()
    expect(store.list().length).toBe(0)

    // Import from snapshot
    const importRes = await localVault.importSnapshot(vaultPath)
    expect(importRes.success).toBe(true)
    expect(importRes.restoredItems).toBe(1)

    const restored = store.list()[0]
    expect(restored.id).toBe(originalItem.id)
    expect(store.getFullText(restored.id)).toBe(longArticle)
  })
})
