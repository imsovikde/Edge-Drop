import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { computeDiff, computeIntraLineDiff, formatUnifiedDiff } from '../src/lib/diffEngine'
import { ItemStore } from '../electron/store/ItemStore'
import { PATHS } from '../electron/store/paths'
import type { ClipboardItem } from '../shared/types'

describe('Epoch 6: Clipboard Diff Viewer & Lifetime Vault Archive Deep Search', () => {
  describe('Diff Engine (Myers / LCS Algorithm)', () => {
    it('accurately identifies common, added, and removed lines', () => {
      const oldText = 'line 1\nline 2\nline 3'
      const newText = 'line 1\nline 2 modified\nline 3\nline 4'

      const diff = computeDiff(oldText, newText)

      expect(diff.stats.additions).toBe(2) // 'line 2 modified' and 'line 4'
      expect(diff.stats.deletions).toBe(1) // 'line 2'
      expect(diff.stats.unchanged).toBe(2) // 'line 1' and 'line 3'

      expect(diff.lines.some((l) => l.type === 'common' && l.value === 'line 1')).toBe(true)
      expect(diff.lines.some((l) => l.type === 'remove' && l.value === 'line 2')).toBe(true)
      expect(diff.lines.some((l) => l.type === 'add' && l.value === 'line 2 modified')).toBe(true)
      expect(diff.lines.some((l) => l.type === 'add' && l.value === 'line 4')).toBe(true)
    })

    it('computes intra-line token diffs for adjacent modified lines', () => {
      const oldLine = 'const port = 3000;'
      const newLine = 'const port = 8080;'

      const { oldTokens, newTokens } = computeIntraLineDiff(oldLine, newLine)

      expect(oldTokens.some((t) => t.type === 'remove' && t.value === '3000')).toBe(true)
      expect(newTokens.some((t) => t.type === 'add' && t.value === '8080')).toBe(true)
      expect(oldTokens.some((t) => t.type === 'common' && t.value === 'const')).toBe(true)
    })

    it('handles identical texts and empty texts gracefully', () => {
      const identical = computeDiff('hello world\nedge drop', 'hello world\nedge drop')
      expect(identical.stats.additions).toBe(0)
      expect(identical.stats.deletions).toBe(0)
      expect(identical.stats.unchanged).toBe(2)

      const fromEmpty = computeDiff('', 'new line')
      expect(fromEmpty.stats.additions).toBe(1)
      expect(fromEmpty.stats.deletions).toBe(0)

      const toEmpty = computeDiff('old line', '')
      expect(toEmpty.stats.additions).toBe(0)
      expect(toEmpty.stats.deletions).toBe(1)
    })

    it('formats unified git-compatible diff patches for 1-click clipboard export', () => {
      const diff = computeDiff('foo\nbar', 'foo\nbaz')
      const patch = formatUnifiedDiff(diff, 'A', 'B')

      expect(patch).toContain('--- a/A')
      expect(patch).toContain('+++ b/B')
      expect(patch).toContain(' foo')
      expect(patch).toContain('-bar')
      expect(patch).toContain('+baz')
    })
  })

  describe('ItemStore.deepSearch Subsystem', () => {
    let store: ItemStore
    let tempDir: string

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'ed-epoch6-'))
      vi.spyOn(PATHS, 'root').mockReturnValue(tempDir)
      vi.spyOn(PATHS, 'indexFile').mockReturnValue(join(tempDir, 'items.json'))
      vi.spyOn(PATHS, 'imagesDir').mockReturnValue(join(tempDir, 'images'))
      vi.spyOn(PATHS, 'payloadsDir').mockReturnValue(join(tempDir, 'payloads'))
      vi.spyOn(PATHS, 'imageFile').mockImplementation((id: string) => join(tempDir, 'images', `${id}.png`))
      mkdirSync(join(tempDir, 'payloads'), { recursive: true })
      store = new ItemStore(50)
    })

    afterEach(() => {
      vi.restoreAllMocks()
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch { /* ignore */ }
    })

    it('finds search terms in standard in-memory preview text', () => {
      const item: ClipboardItem = {
        id: 'search-1',
        data: { kind: 'text', text: 'Important auth token: secret_jwt_payload_xyz' },
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: false,
        colorTag: 'ruby'
      }
      store.upsertRemoteItem(item)

      const results = store.deepSearch('secret_jwt')
      expect(results.length).toBe(1)
      expect(results[0].id).toBe('search-1')
      expect(results[0].matchedField).toBe('text')
      expect(results[0].matchSnippet).toContain('secret_jwt_payload_xyz')
    })

    it('deep-searches disk payloads beyond character 300 for large items', () => {
      const prefix = 'Introductory snippet that does not have the keyword. '.repeat(10)
      const secretKeyword = 'CRITICAL_ARCHIVE_MATCH_9999'
      const suffix = ' Subsequent payload content after the match.'.repeat(10)
      const fullText = `${prefix}${secretKeyword}${suffix}`

      // Create large payload item
      const item: ClipboardItem = {
        id: 'deep-item-1',
        data: {
          kind: 'text',
          text: fullText.slice(0, 300), // Preview doesn't have the secretKeyword!
          hasFullPayload: true,
          previewText: fullText.slice(0, 300)
        },
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: true
      }

      // Write full payload to disk
      writeFileSync(join(tempDir, 'payloads', 'deep-item-1.txt'), fullText, 'utf8')
      store.upsertRemoteItem(item)

      // In-memory preview should NOT contain the secret keyword
      expect(store.get('deep-item-1')?.data.text).not.toContain(secretKeyword)

      // Deep search SHOULD find it on disk in payloads/
      const results = store.deepSearch('CRITICAL_ARCHIVE_MATCH')
      expect(results.length).toBe(1)
      expect(results[0].id).toBe('deep-item-1')
      expect(results[0].matchedField).toBe('payload')
      expect(results[0].matchSnippet).toContain(secretKeyword)
    })

    it('filters deep search results by date range and color tags', () => {
      const oneHourAgo = Date.now() - 3600 * 1000
      const twoWeeksAgo = Date.now() - 14 * 86400 * 1000

      store.upsertRemoteItem({
        id: 'today-ruby',
        data: { kind: 'text', text: 'Architecture blueprint' },
        capturedAt: oneHourAgo,
        hitCount: 1,
        pinned: false,
        colorTag: 'ruby'
      })

      store.upsertRemoteItem({
        id: 'old-emerald',
        data: { kind: 'text', text: 'Architecture retrospective' },
        capturedAt: twoWeeksAgo,
        hitCount: 1,
        pinned: false,
        colorTag: 'emerald'
      })

      // Search 'Architecture' for 'today'
      const todayResults = store.deepSearch('Architecture', { dateRange: 'today' })
      expect(todayResults.some((r) => r.id === 'today-ruby')).toBe(true)
      expect(todayResults.some((r) => r.id === 'old-emerald')).toBe(false)

      // Search with tag filter 'emerald'
      const tagResults = store.deepSearch('Architecture', { tag: 'emerald' })
      expect(tagResults.some((r) => r.id === 'today-ruby')).toBe(false)
      expect(tagResults.some((r) => r.id === 'old-emerald')).toBe(true)
    })
  })
})
