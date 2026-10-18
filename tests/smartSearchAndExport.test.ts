import { describe, it, expect } from 'vitest'
import { parseSearchQuery, matchesSmartQuery } from '../src/hooks/useFilteredItems'
import {
  exportItemsToMarkdown,
  exportItemsToJson,
  exportItemsToPlainText
} from '../src/lib/exportUtils'
import type { ClipboardItemDto } from '../shared/types'

describe('Smart Search Operators & Query Parser', () => {
  it('parses composite operator tokens and free text terms cleanly', () => {
    const parsed = parseSearchQuery('is:pinned is:link github auth tag:emerald')
    expect(parsed.operators).toEqual([
      { key: 'is', val: 'pinned' },
      { key: 'is', val: 'link' },
      { key: 'tag', val: 'emerald' }
    ])
    expect(parsed.terms).toEqual(['github', 'auth'])
  })

  it('matches pinned and unpinned operator queries correctly', () => {
    const pinnedItem: ClipboardItemDto = {
      id: 'item-1',
      capturedAt: Date.now(),
      pinned: true,
      data: { kind: 'text', text: 'Important API token' }
    }
    const unpinnedItem: ClipboardItemDto = {
      id: 'item-2',
      capturedAt: Date.now(),
      pinned: false,
      data: { kind: 'text', text: 'Scratch note' }
    }

    const pinQuery = parseSearchQuery('is:pinned')
    expect(matchesSmartQuery(pinnedItem, pinQuery)).toBe(true)
    expect(matchesSmartQuery(unpinnedItem, pinQuery)).toBe(false)

    const unpinQuery = parseSearchQuery('is:unpinned')
    expect(matchesSmartQuery(pinnedItem, unpinQuery)).toBe(false)
    expect(matchesSmartQuery(unpinnedItem, unpinQuery)).toBe(true)
  })

  it('matches links, images, files, code and color operators', () => {
    const linkItem: ClipboardItemDto = {
      id: 'url-1',
      capturedAt: Date.now(),
      pinned: false,
      data: { kind: 'text', text: 'https://github.com/imsovikde/Edge-Drop', isUrl: true }
    }
    const codeItem: ClipboardItemDto = {
      id: 'code-1',
      capturedAt: Date.now(),
      pinned: false,
      data: { kind: 'text', text: 'import React from "react"\nexport function App() { return <div/> }' }
    }
    const fileItem: ClipboardItemDto = {
      id: 'file-1',
      capturedAt: Date.now(),
      pinned: false,
      data: { kind: 'files', paths: ['C:\\docs\\report.pdf'] }
    }

    expect(matchesSmartQuery(linkItem, parseSearchQuery('is:link'))).toBe(true)
    expect(matchesSmartQuery(codeItem, parseSearchQuery('is:link'))).toBe(false)

    expect(matchesSmartQuery(codeItem, parseSearchQuery('is:code'))).toBe(true)
    expect(matchesSmartQuery(linkItem, parseSearchQuery('is:code'))).toBe(false)

    expect(matchesSmartQuery(fileItem, parseSearchQuery('is:file'))).toBe(true)
    expect(matchesSmartQuery(linkItem, parseSearchQuery('is:file'))).toBe(false)
  })

  it('filters by color tag accurately', () => {
    const taggedRuby: ClipboardItemDto = {
      id: 'tag-1',
      capturedAt: Date.now(),
      pinned: false,
      colorTag: 'ruby',
      data: { kind: 'text', text: 'Deploy instructions' }
    }
    const untagged: ClipboardItemDto = {
      id: 'tag-2',
      capturedAt: Date.now(),
      pinned: false,
      data: { kind: 'text', text: 'Regular text' }
    }

    expect(matchesSmartQuery(taggedRuby, parseSearchQuery('tag:ruby'))).toBe(true)
    expect(matchesSmartQuery(untagged, parseSearchQuery('tag:ruby'))).toBe(false)
    expect(matchesSmartQuery(taggedRuby, parseSearchQuery('tag:emerald'))).toBe(false)

    expect(matchesSmartQuery(taggedRuby, parseSearchQuery('has:tag'))).toBe(true)
    expect(matchesSmartQuery(untagged, parseSearchQuery('has:tag'))).toBe(false)
  })

  it('filters sensitive tokens and secret keys using is:secret operator', () => {
    const secretItem: ClipboardItemDto = {
      id: 'sec-1',
      capturedAt: Date.now(),
      pinned: false,
      data: { kind: 'text', text: 'sk-proj-abc123def45678901234567890abcdef' }
    }
    const regularItem: ClipboardItemDto = {
      id: 'sec-2',
      capturedAt: Date.now(),
      pinned: false,
      data: { kind: 'text', text: 'Clean documentation without secrets' }
    }

    expect(matchesSmartQuery(secretItem, parseSearchQuery('is:secret'))).toBe(true)
    expect(matchesSmartQuery(regularItem, parseSearchQuery('is:secret'))).toBe(false)
  })
})

describe('Clipboard Archive Export Engine', () => {
  const sampleItems: ClipboardItemDto[] = [
    {
      id: 'it-1',
      capturedAt: 1770000000000,
      pinned: true,
      colorTag: 'emerald',
      data: { kind: 'text', text: 'const answer = 42;' }
    },
    {
      id: 'it-2',
      capturedAt: 1770001000000,
      pinned: false,
      data: { kind: 'text', text: 'https://example.com/vault', isUrl: true }
    },
    {
      id: 'it-3',
      capturedAt: 1770002000000,
      pinned: false,
      data: { kind: 'files', paths: ['/Users/dev/readme.txt', '/Users/dev/logo.png'] }
    }
  ]

  it('exports structured Markdown with headers, metadata, and code fences', () => {
    const md = exportItemsToMarkdown(sampleItems)
    expect(md).toContain('# Edge-Drop Clipboard Archive')
    expect(md).toContain('## 1. TEXT [PINNED] [TAG: EMERALD]')
    expect(md).toContain('const answer = 42;')
    expect(md).toContain('## 2. TEXT')
    expect(md).toContain('- **URL**: [https://example.com/vault](https://example.com/vault)')
    expect(md).toContain('## 3. FILES')
    expect(md).toContain('- `readme.txt`')
    expect(md).toContain('- `logo.png`')
  })

  it('exports structured JSON with correct schema and item counts', () => {
    const jsonStr = exportItemsToJson(sampleItems)
    const parsed = JSON.parse(jsonStr)
    expect(parsed.generator).toBe('Edge-Drop')
    expect(parsed.itemCount).toBe(3)
    expect(parsed.items.length).toBe(3)
    expect(parsed.items[0].id).toBe('it-1')
    expect(parsed.items[0].pinned).toBe(true)
    expect(parsed.items[0].colorTag).toBe('emerald')
  })

  it('exports clean Plain Text representations with delimiters', () => {
    const txt = exportItemsToPlainText(sampleItems)
    expect(txt).toContain('[1] TEXT')
    expect(txt).toContain('const answer = 42;')
    expect(txt).toContain('[2] TEXT')
    expect(txt).toContain('https://example.com/vault')
    expect(txt).toContain('[3] FILES')
    expect(txt).toContain('readme.txt\nlogo.png')
    expect(txt).toContain('========================================')
  })
})
