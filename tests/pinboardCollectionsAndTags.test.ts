import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ItemStore } from '../electron/store/ItemStore'
import type { ClipboardItem, ColorTag } from '../shared/types'

describe('Pinboard Collections & Color Tag Workspaces (Epoch 4)', () => {
  let store: ItemStore

  beforeEach(() => {
    store = new ItemStore(50)
  })

  it('sets and updates color tags on clipboard items', () => {
    const item: ClipboardItem = {
      id: 'item-1',
      data: { kind: 'text', text: 'Important API key' },
      capturedAt: Date.now(),
      hitCount: 1,
      pinned: false
    }

    store.upsertRemoteItem(item)
    expect(store.get('item-1')?.colorTag).toBeUndefined()

    // Assign 'ruby' color tag
    const updatedRuby = store.setColorTag('item-1', 'ruby')
    expect(Array.isArray(updatedRuby)).toBe(true)
    expect(store.get('item-1')?.colorTag).toBe('ruby')

    // Switch to 'sapphire' color tag
    const updatedSapphire = store.setColorTag('item-1', 'sapphire')
    expect(Array.isArray(updatedSapphire)).toBe(true)
    expect(store.get('item-1')?.colorTag).toBe('sapphire')

    // Clear color tag
    const cleared = store.setColorTag('item-1', undefined)
    expect(Array.isArray(cleared)).toBe(true)
    expect(store.get('item-1')?.colorTag).toBeUndefined()
  })

  it('sets custom semantic tags array on clipboard items', () => {
    const item: ClipboardItem = {
      id: 'item-2',
      data: { kind: 'text', text: 'https://linear.app/issue/ENG-402' },
      capturedAt: Date.now(),
      hitCount: 1,
      pinned: true
    }

    store.upsertRemoteItem(item)
    const tagged = store.setTags('item-2', ['work', 'linear', 'frontend'])
    expect(Array.isArray(tagged)).toBe(true)
    expect(store.get('item-2')?.tags).toEqual(['work', 'linear', 'frontend'])

    // Update tags with duplicates stripped/normalized
    store.setTags('item-2', ['work', 'work', '  release  ', ''])
    expect(store.get('item-2')?.tags).toEqual(['work', 'release'])

    // Clear tags
    store.setTags('item-2', [])
    expect(store.get('item-2')?.tags).toBeUndefined()
  })

  it('preserves colorTag and tags during upsertRemoteItem sync updates', () => {
    const original: ClipboardItem = {
      id: 'item-sync-1',
      data: { kind: 'text', text: 'Auth Token Bearer xyz' },
      capturedAt: 1000,
      hitCount: 1,
      pinned: false,
      colorTag: 'emerald',
      tags: ['security', 'auth']
    }

    store.upsertRemoteItem(original)
    expect(store.get('item-sync-1')?.colorTag).toBe('emerald')
    expect(store.get('item-sync-1')?.tags).toEqual(['security', 'auth'])

    // Remote update changes color tag to ruby and updates hit count
    const remoteUpdate: ClipboardItem = {
      ...original,
      hitCount: 2,
      colorTag: 'ruby',
      tags: ['security', 'critical']
    }

    const changed = store.upsertRemoteItem(remoteUpdate)
    expect(changed).toBe(true)
    expect(store.get('item-sync-1')?.colorTag).toBe('ruby')
    expect(store.get('item-sync-1')?.tags).toEqual(['security', 'critical'])

    // Identical remote update should detect noop and return false
    const noopChanged = store.upsertRemoteItem(remoteUpdate)
    expect(noopChanged).toBe(false)
  })

  it('filters items correctly by colorTag', () => {
    const items: ClipboardItem[] = [
      {
        id: 'c1',
        data: { kind: 'text', text: 'Ruby Item' },
        capturedAt: 100,
        hitCount: 1,
        pinned: false,
        colorTag: 'ruby'
      },
      {
        id: 'c2',
        data: { kind: 'text', text: 'Amber Item' },
        capturedAt: 200,
        hitCount: 1,
        pinned: false,
        colorTag: 'amber'
      },
      {
        id: 'c3',
        data: { kind: 'text', text: 'Emerald Item' },
        capturedAt: 300,
        hitCount: 1,
        pinned: true,
        colorTag: 'emerald'
      },
      {
        id: 'c4',
        data: { kind: 'text', text: 'Untagged Item' },
        capturedAt: 400,
        hitCount: 1,
        pinned: false
      }
    ]

    for (const it of items) {
      store.upsertRemoteItem(it)
    }

    const all = store.toDto()
    expect(all).toHaveLength(4)

    // Filter helper matching useFilteredItems logic
    const filterByTag = (list: { colorTag?: ColorTag }[], tag: ColorTag | null) => {
      if (!tag) return list
      return list.filter((it) => it.colorTag === tag)
    }

    expect(filterByTag(all, null)).toHaveLength(4)
    expect(filterByTag(all, 'ruby')).toHaveLength(1)
    expect(filterByTag(all, 'ruby')[0].id).toBe('c1')

    expect(filterByTag(all, 'emerald')).toHaveLength(1)
    expect(filterByTag(all, 'emerald')[0].id).toBe('c3')

    expect(filterByTag(all, 'slate')).toHaveLength(0)
  })
})
