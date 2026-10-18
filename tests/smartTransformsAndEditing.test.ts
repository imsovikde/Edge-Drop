import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ItemStore } from '../electron/store/ItemStore'
import { PATHS } from '../electron/store/paths'
import type { ClipboardItem } from '../shared/types'
import {
  jsonPrettify,
  jsonMinify,
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  toConstantCase,
  toTitleCase,
  cleanWhitespace,
  tableToMarkdown
} from '../src/lib/smartTransforms'

describe('Smart Transforms & In-Preview Text Editing (Epoch 5)', () => {
  describe('Smart Transforms Library', () => {
    it('prettifies and minifies valid JSON', () => {
      const raw = '{"name":"Edge-Drop","version":"0.8.0","features":["sync","vault"]}'
      const pretty = jsonPrettify(raw)
      expect(pretty.success).toBe(true)
      expect(pretty.result).toContain('\n  "name": "Edge-Drop"')

      const mini = jsonMinify(pretty.result)
      expect(mini.success).toBe(true)
      expect(mini.result).toBe(raw)

      const invalid = jsonPrettify('{broken json')
      expect(invalid.success).toBe(false)
      expect(invalid.result).toBe('{broken json')
      expect(invalid.error).toBeDefined()
    })

    it('converts cases across identifiers and sentences', () => {
      expect(toCamelCase('user_first_name')).toBe('userFirstName')
      expect(toCamelCase('User-First-Name')).toBe('userFirstName')
      expect(toCamelCase('user first name')).toBe('userFirstName')

      expect(toSnakeCase('userFirstName')).toBe('user_first_name')
      expect(toSnakeCase('user-first-name')).toBe('user_first_name')
      expect(toSnakeCase('User First Name')).toBe('user_first_name')

      expect(toKebabCase('userFirstName')).toBe('user-first-name')
      expect(toKebabCase('user_first_name')).toBe('user-first-name')

      expect(toConstantCase('userFirstName')).toBe('USER_FIRST_NAME')
      expect(toConstantCase('user-first-name')).toBe('USER_FIRST_NAME')

      expect(toTitleCase('the quick brown fox')).toBe('The Quick Brown Fox')
      expect(toTitleCase('user_first_name')).toBe('User First Name')
    })

    it('cleans whitespace and condenses consecutive blank lines', () => {
      const dirty = '  const a = 1;   \n\n\n\n  const b = 2;  \n   \n\n  return a + b;   '
      const cleaned = cleanWhitespace(dirty)
      expect(cleaned).toBe('  const a = 1;\n\n  const b = 2;\n\n  return a + b;')
    })

    it('converts CSV and TSV data into Markdown tables', () => {
      const csv = 'Name, Role, Dept\nAlice, Staff Architect, Systems\nBob, Motion Designer, Creative'
      const mdTable = tableToMarkdown(csv)
      expect(mdTable.success).toBe(true)
      expect(mdTable.result).toContain('| Name  | Role')
      expect(mdTable.result).toContain('| ----- |')
      expect(mdTable.result).toContain('| Alice | Staff Architect | Systems')

      const tsv = 'Key\tValue\nAPI_HOST\thttps://api.edgedrop.com\nTIMEOUT_MS\t5000'
      const tsvTable = tableToMarkdown(tsv)
      expect(tsvTable.success).toBe(true)
      expect(tsvTable.result).toContain('| Key')
      expect(tsvTable.result).toContain('| API_HOST')
    })
  })

  describe('ItemStore.updateText integration', () => {
    let store: ItemStore
    let tempDir: string

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'ed-epoch5-'))
      vi.spyOn(PATHS, 'root').mockReturnValue(tempDir)
      vi.spyOn(PATHS, 'indexFile').mockReturnValue(join(tempDir, 'items.json'))
      vi.spyOn(PATHS, 'imagesDir').mockReturnValue(join(tempDir, 'images'))
      vi.spyOn(PATHS, 'payloadsDir').mockReturnValue(join(tempDir, 'payloads'))
      vi.spyOn(PATHS, 'imageFile').mockImplementation((id: string) => join(tempDir, 'images', `${id}.png`))
      store = new ItemStore(50)
    })

    afterEach(() => {
      vi.restoreAllMocks()
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch { /* ignore */ }
    })

    it('updates small text inline without creating disk payload', () => {
      const item: ClipboardItem = {
        id: 'edit-1',
        data: { kind: 'text', text: 'Initial drafted note' },
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: false,
        colorTag: 'amber'
      }

      store.upsertRemoteItem(item)
      expect(store.get('edit-1')?.data.text).toBe('Initial drafted note')

      const ok = store.updateText('edit-1', 'Updated note with modifications')
      expect(ok).toBe(true)

      const updated = store.get('edit-1')
      expect(updated?.data.text).toBe('Updated note with modifications')
      expect(updated?.data.hasFullPayload).toBe(false)
      expect(updated?.colorTag).toBe('amber')
      expect(store.getFullText('edit-1')).toBe('Updated note with modifications')
    })

    it('updates large text (>300 chars) by streaming to disk payload', () => {
      const item: ClipboardItem = {
        id: 'edit-large-1',
        data: { kind: 'text', text: 'Small initial' },
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: true
      }

      store.upsertRemoteItem(item)

      // Create a 500-char string
      const largeText = 'EdgeDrop Large Text Content. '.repeat(20)
      expect(largeText.length).toBeGreaterThan(300)

      const ok = store.updateText('edit-large-1', largeText)
      expect(ok).toBe(true)

      const updated = store.get('edit-large-1')
      expect(updated?.data.hasFullPayload).toBe(true)
      expect(updated?.data.previewText).toBe(largeText.slice(0, 300))
      expect(updated?.data.text).toBe(largeText.slice(0, 300))
      expect(store.getFullText('edit-large-1')).toBe(largeText)

      // Shrink back down to <= 300 chars: disk payload should be cleaned up
      const okSmall = store.updateText('edit-large-1', 'Back to short text')
      expect(okSmall).toBe(true)
      const shrunk = store.get('edit-large-1')
      expect(shrunk?.data.hasFullPayload).toBe(false)
      expect(shrunk?.data.text).toBe('Back to short text')
      expect(store.getFullText('edit-large-1')).toBe('Back to short text')
    })

    it('rejects updateText on non-existent or non-text items safely', () => {
      expect(store.updateText('non-existent', 'hello')).toBe(false)

      const imageItem: ClipboardItem = {
        id: 'img-1',
        data: { kind: 'image', imageId: 'img-xyz', width: 100, height: 100, bytes: 500, ext: 'png' },
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: false
      }
      store.upsertRemoteItem(imageItem)
      expect(store.updateText('img-1', 'hello')).toBe(false)
    })
  })
})
