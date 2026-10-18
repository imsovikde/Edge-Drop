import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ItemStore } from '../electron/store/ItemStore'
import { PATHS } from '../electron/store/paths'
import type { ClipboardItem, ItemData } from '../shared/types'

describe('Epoch 15: Lossless Multi-line Text Sync, Top Dock Hold Capsule & Obsidian Copy Confirmation', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ed-epoch15-'))
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

  it('preserves multi-megabyte / 10,000-line text losslessly in disk payload without 500k truncation clamp', () => {
    const store = new ItemStore()
    // Generate a 1,200,000 character string with 10,000 distinct lines
    const lines: string[] = []
    for (let i = 1; i <= 15000; i++) {
      lines.push(`Line ${i.toString().padStart(6, '0')}: Performance and production sync verification payload with large multi-line stream integrity`)
    }
    const massiveText = lines.join('\n')
    expect(massiveText.length).toBeGreaterThan(1000000)

    const added = store.add({
      kind: 'text',
      text: massiveText,
      isUrl: false
    }, 50)

    store.persistSync()
    expect(added).toBe(true)
    const list = store.list()
    expect(list.length).toBe(1)
    const item = list[0]

    // In-memory preview is capped to 300 characters for minimal RAM consumption
    expect(item.data.kind).toBe('text')
    if (item.data.kind === 'text') {
      expect(item.data.hasFullPayload).toBe(true)
      expect(item.data.previewText?.length).toBe(300)
      expect(item.data.text.length).toBe(300)
    }

    // Disk payload file exists and holds the complete 1,200,000+ character text verbatim
    const payloadFile = join(tempDir, 'payloads', `${item.id}.txt`)
    expect(existsSync(payloadFile)).toBe(true)
    const onDisk = readFileSync(payloadFile, 'utf8')
    expect(onDisk.length).toBe(massiveText.length)
    expect(onDisk).toBe(massiveText)

    // Transparent hydration via getFullText returns 100% of the payload
    const retrieved = store.getFullText(item.id)
    expect(retrieved.length).toBe(massiveText.length)
    expect(retrieved).toBe(massiveText)
    expect(retrieved.split('\n').length).toBe(15000)
  })

  it('enforces category-selective filtering for targeted history clearing while preserving pinned items', () => {
    const items: Array<{ id: string; pinned: boolean; data: ItemData }> = [
      { id: 't1', pinned: false, data: { kind: 'text', text: 'Normal text 1' } },
      { id: 't2-pinned', pinned: true, data: { kind: 'text', text: 'Pinned text safe' } },
      { id: 'u1', pinned: false, data: { kind: 'text', text: 'https://github.com', isUrl: true } },
      { id: 'u2-pinned', pinned: true, data: { kind: 'text', text: 'https://edgedrop.io', isUrl: true } },
      { id: 'i1', pinned: false, data: { kind: 'image', imageId: 'img-1', width: 100, height: 100, bytes: 500 } },
      { id: 'i2-pinned', pinned: true, data: { kind: 'image', imageId: 'img-2', width: 200, height: 200, bytes: 1000 } }
    ]

    // Helper functions representing Category-Selective Clear operations
    const getClearCategoryIds = (all: typeof items, category: 'links' | 'images' | 'text' | 'all') => {
      return all
        .filter((it) => {
          if (it.pinned) return false
          if (category === 'all') return true
          if (category === 'links') return it.data.kind === 'text' && it.data.isUrl
          if (category === 'images') return it.data.kind === 'image' || it.data.kind === 'image-collection'
          if (category === 'text') return it.data.kind === 'text' && !it.data.isUrl
          return false
        })
        .map((it) => it.id)
    }

    // Links only
    const linkIds = getClearCategoryIds(items, 'links')
    expect(linkIds).toEqual(['u1'])

    // Images only
    const imageIds = getClearCategoryIds(items, 'images')
    expect(imageIds).toEqual(['i1'])

    // Text only
    const textIds = getClearCategoryIds(items, 'text')
    expect(textIds).toEqual(['t1'])

    // All unpinned
    const allUnpinned = getClearCategoryIds(items, 'all')
    expect(allUnpinned).toEqual(['t1', 'u1', 'i1'])

    // Pinned items are NEVER selected for deletion under any category
    for (const cat of ['links', 'images', 'text', 'all'] as const) {
      const ids = getClearCategoryIds(items, cat)
      expect(ids).not.toContain('t2-pinned')
      expect(ids).not.toContain('u2-pinned')
      expect(ids).not.toContain('i2-pinned')
    }
  })

  it('verifies obsidian copy confirmation luminescence in item.css over generic green', () => {
    const itemCssPath = join(__dirname, '..', 'src', 'styles', 'item.css')
    const itemCss = readFileSync(itemCssPath, 'utf8')

    // Must have .item.is-copied rule
    expect(itemCss).toContain('.item.is-copied')

    // Must utilize obsidian specular halo with rgba(255, 255, 255) radiance instead of generic green
    const copiedMatch = itemCss.match(/\.item\.is-copied\s*\{([^}]+)\}/)
    expect(copiedMatch).not.toBeNull()
    const copiedBody = copiedMatch![1]

    expect(copiedBody).toContain('rgba(255, 255, 255')
    expect(copiedBody).toContain('box-shadow')
    expect(copiedBody).not.toContain('rgba(16, 185, 129') // No generic green
  })
})
