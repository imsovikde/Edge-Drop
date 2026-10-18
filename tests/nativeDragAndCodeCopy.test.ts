import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeCleanCode } from '../src/lib/codeFormatter'
import { startDragOut } from '../electron/main/drag'
import type { ItemData } from '../shared/types'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('Epoch 9: Cross-Platform Native Clipboard & Drag Parity', () => {
  describe('normalizeCleanCode', () => {
    it('normalizes mixed CRLF/LF line endings and trims trailing line whitespace', () => {
      const input = 'function test() {   \r\n    const a = 1; \t\n    return a;\r\n}\n\n'
      const normalizedUnix = normalizeCleanCode(input, 'darwin')
      expect(normalizedUnix).toBe('function test() {\n    const a = 1;\n    return a;\n}')

      const normalizedWin = normalizeCleanCode(input, 'win32')
      expect(normalizedWin).toBe('function test() {\r\n    const a = 1;\r\n    return a;\r\n}')
    })

    it('strictly preserves leading indentation for code blocks', () => {
      const indented = '\t\tconst x = 10;\n    const y = 20;\n        const z = 30;'
      const result = normalizeCleanCode(indented, 'linux')
      expect(result).toBe('\t\tconst x = 10;\n    const y = 20;\n        const z = 30;')
    })

    it('gracefully handles empty strings and single lines', () => {
      expect(normalizeCleanCode('')).toBe('')
      expect(normalizeCleanCode('   \n\n\n')).toBe('')
      expect(normalizeCleanCode('console.log("hello");   ', 'darwin')).toBe('console.log("hello");')
    })
  })

  describe('CodeBlock copy button integration', () => {
    it('CodeBlock imports and calls normalizeCleanCode on copy action', () => {
      const codeBlockSrc = read('src/components/CodeBlock.tsx')
      expect(codeBlockSrc).toContain("import { normalizeCleanCode } from '../lib/codeFormatter'")
      expect(codeBlockSrc).toContain('const clean = normalizeCleanCode(code)')
      expect(codeBlockSrc).toContain('writeText(clean)')
    })
  })

  describe('Native drag-out staging format parity', () => {
    it('startDragOut guarantees both file and files array are passed to sender.startDrag', () => {
      const dragSrc = read('electron/main/drag.ts')
      expect(dragSrc).toContain('files: staged.files && staged.files.length > 0 ? staged.files : [staged.file]')
      expect(dragSrc).toContain('sender.startDrag(item)')
    })
  })
})
