import { describe, it, expect } from 'vitest'
import {
  exportSingleItemToMarkdown,
  exportSingleItemToPlainText,
  exportSingleItemToPdf,
  generateExportFilename
} from '../src/lib/singleItemExport'
import type { ClipboardItemDto } from '../shared/types'

function makeMockItem(overrides: Partial<ClipboardItemDto> = {}): ClipboardItemDto {
  return {
    id: 'test-item-1234',
    capturedAt: 1773800000000,
    pinned: false,
    data: {
      kind: 'text',
      text: 'const hello = "world";\nconsole.log(hello);',
      charCount: 42,
      isUrl: false
    },
    ...overrides
  }
}

describe('singleItemExport engine', () => {
  it('generates a clean, sanitized filename across formats', () => {
    const item = makeMockItem()
    const fnMd = generateExportFilename(item, 'md')
    const fnTxt = generateExportFilename(item, 'txt')
    const fnPdf = generateExportFilename(item, 'pdf')

    expect(fnMd).toMatch(/^edge-drop-.*\.md$/)
    expect(fnTxt).toMatch(/^edge-drop-.*\.txt$/)
    expect(fnPdf).toMatch(/^edge-drop-.*\.pdf$/)
    expect(fnMd).not.toContain('/')
    expect(fnMd).not.toContain('\\')
    expect(fnMd).not.toContain(':')
  })

  it('exports spotless plain text without altering any character or whitespace', () => {
    const raw = '   Indented line 1\n\tTabbed line 2\r\nSpecial chars: !@#$%^&*()_+~`'
    const item = makeMockItem({ data: { kind: 'text', text: raw, charCount: raw.length } })
    const { content, filename } = exportSingleItemToPlainText(item)

    expect(content).toBe(raw)
    expect(filename.endsWith('.txt')).toBe(true)
  })

  it('exports structured Markdown with metadata and code fences', () => {
    const code = 'function add(a: number, b: number): number {\n  return a + b;\n}'
    const item = makeMockItem({
      pinned: true,
      colorTag: 'emerald',
      data: { kind: 'text', text: code, charCount: code.length }
    })
    const { content, filename } = exportSingleItemToMarkdown(item)

    expect(filename.endsWith('.md')).toBe(true)
    expect(content).toContain('# Edge-Drop Export')
    expect(content).toContain('**Captured**:')
    expect(content).toContain('**Status**: Pinned')
    expect(content).toContain('**Tag**: EMERALD')
    expect(content).toContain('```typescript')
    expect(content).toContain(code)
  })

  it('formats URLs in Markdown with clickable hyperlinks', () => {
    const url = 'https://github.com/imsovikde/Edge-Drop'
    const item = makeMockItem({
      data: { kind: 'text', text: url, charCount: url.length, isUrl: true }
    })
    const { content } = exportSingleItemToMarkdown(item)

    expect(content).toContain(`[${url}](${url})`)
  })

  it('generates a valid, standards-compliant PDF 1.4 binary document', () => {
    const item = makeMockItem({
      data: {
        kind: 'text',
        text: 'This is a high-fidelity export test with special characters: (parentheses) and \\backslash.',
        charCount: 85
      }
    })
    const { pdfBytes, filename } = exportSingleItemToPdf(item)

    expect(filename.endsWith('.pdf')).toBe(true)
    expect(pdfBytes.length).toBeGreaterThan(100)

    const decoder = new TextDecoder()
    const pdfText = decoder.decode(pdfBytes)

    // Verify PDF 1.4 structure
    expect(pdfText.startsWith('%PDF-1.4')).toBe(true)
    expect(pdfText).toContain('/Type /Catalog')
    expect(pdfText).toContain('/Type /Pages')
    expect(pdfText).toContain('/Type /Font')
    expect(pdfText).toContain('/BaseFont /Helvetica')
    expect(pdfText).toContain('xref')
    expect(pdfText).toContain('trailer')
    expect(pdfText).toContain('startxref')
    expect(pdfText.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('paginates multi-page documents when text exceeds single page capacity', () => {
    // Generate a long multi-line document (> 80 lines)
    const longLines = Array.from({ length: 90 }, (_, i) => `Line ${i + 1}: The quick brown fox jumps over the lazy dog.`)
    const item = makeMockItem({
      data: { kind: 'text', text: longLines.join('\n'), charCount: 4500 }
    })

    const { pdfBytes } = exportSingleItemToPdf(item)
    const decoder = new TextDecoder()
    const pdfText = decoder.decode(pdfBytes)

    // Verify multiple page objects exist in pages dictionary
    expect(pdfText).toContain('/Count 3')
    expect(pdfText).toContain('Page 1 of 3')
    expect(pdfText).toContain('Page 2 of 3')
    expect(pdfText).toContain('Page 3 of 3')
  })
})
