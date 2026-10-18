import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '../src/store/appStore'
import type { ClipboardItemDto } from '../shared/types'

describe('Multi-Selection Batch Operations', () => {
  const mockItems: ClipboardItemDto[] = [
    {
      id: 'item-1',
      kind: 'text',
      capturedAt: Date.now() - 3000,
      hitCount: 1,
      pinned: false,
      data: {
        kind: 'text',
        text: 'First line of documentation',
        previewText: 'First line of documentation',
        hasFullPayload: false,
        charCount: 26,
        lineCount: 1
      }
    },
    {
      id: 'item-2',
      kind: 'text',
      capturedAt: Date.now() - 2000,
      hitCount: 1,
      pinned: false,
      data: {
        kind: 'text',
        text: 'Second line of documentation',
        previewText: 'Second line of documentation',
        hasFullPayload: false,
        charCount: 27,
        lineCount: 1
      }
    },
    {
      id: 'item-3',
      kind: 'files',
      capturedAt: Date.now() - 1000,
      hitCount: 1,
      pinned: true,
      colorTag: 'emerald',
      data: {
        kind: 'files',
        paths: ['/home/user/document.pdf', '/home/user/notes.txt'],
        totalBytes: 2048,
        count: 2
      }
    }
  ]

  beforeEach(() => {
    useStore.setState({
      items: [...mockItems],
      selectedItemIds: [],
      isSelectionMode: false
    })
  })

  it('toggles selection and updates isSelectionMode appropriately', () => {
    expect(useStore.getState().isSelectionMode).toBe(false)
    expect(useStore.getState().selectedItemIds).toEqual([])

    useStore.getState().toggleSelectItem('item-1')
    expect(useStore.getState().selectedItemIds).toEqual(['item-1'])
    expect(useStore.getState().isSelectionMode).toBe(true)

    useStore.getState().toggleSelectItem('item-2')
    expect(useStore.getState().selectedItemIds).toEqual(['item-1', 'item-2'])
    expect(useStore.getState().isSelectionMode).toBe(true)

    // Toggling existing item removes it
    useStore.getState().toggleSelectItem('item-1')
    expect(useStore.getState().selectedItemIds).toEqual(['item-2'])
    expect(useStore.getState().isSelectionMode).toBe(true)

    // Toggling last item disables selection mode
    useStore.getState().toggleSelectItem('item-2')
    expect(useStore.getState().selectedItemIds).toEqual([])
    expect(useStore.getState().isSelectionMode).toBe(false)
  })

  it('selects all given IDs and clears selection', () => {
    useStore.getState().selectAllItems(['item-1', 'item-2', 'item-3'])
    expect(useStore.getState().selectedItemIds).toEqual(['item-1', 'item-2', 'item-3'])
    expect(useStore.getState().isSelectionMode).toBe(true)

    useStore.getState().clearSelection()
    expect(useStore.getState().selectedItemIds).toEqual([])
    expect(useStore.getState().isSelectionMode).toBe(false)
  })

  it('batchPin updates pinned status on all selected items', async () => {
    useStore.getState().selectAllItems(['item-1', 'item-2'])
    await useStore.getState().batchPin(true)

    const items = useStore.getState().items
    expect(items.find((i) => i.id === 'item-1')?.pinned).toBe(true)
    expect(items.find((i) => i.id === 'item-2')?.pinned).toBe(true)
  })

  it('batchSetColorTag applies colorTag across all selected items', async () => {
    useStore.getState().selectAllItems(['item-1', 'item-2'])
    await useStore.getState().batchSetColorTag('ruby')

    const items = useStore.getState().items
    expect(items.find((i) => i.id === 'item-1')?.colorTag).toBe('ruby')
    expect(items.find((i) => i.id === 'item-2')?.colorTag).toBe('ruby')
    // Unselected item is unaffected
    expect(items.find((i) => i.id === 'item-3')?.colorTag).toBe('emerald')
  })

  it('batchCombineCopy combines text items with double newlines and writes to clipboard', async () => {
    let clipboardText = ''
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: async (t: string) => {
          clipboardText = t
        }
      }
    })

    useStore.getState().selectAllItems(['item-1', 'item-2'])
    const count = await useStore.getState().batchCombineCopy()

    expect(count).toBe(2)
    expect(clipboardText).toBe('First line of documentation\n\nSecond line of documentation')
  })

  it('batchDelete removes selected items and resets selection state', async () => {
    useStore.getState().selectAllItems(['item-1', 'item-2'])
    await useStore.getState().batchDelete()

    expect(useStore.getState().selectedItemIds).toEqual([])
    expect(useStore.getState().isSelectionMode).toBe(false)
    expect(useStore.getState().items.map((i) => i.id)).toEqual(['item-3'])
  })
})
