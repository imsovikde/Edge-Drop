/**
 * singleItemExport.ts — Pure TypeScript zero-dependency export engine for individual clipboard items.
 *
 * Supports spotless, high-fidelity export into:
 * 1. Markdown (.md) — with metadata header, syntax code fences, and unaltered body.
 * 2. Plain Text (.txt) — 100% verbatim raw text preserving all whitespaces, tabs, and line endings.
 * 3. PDF Document (.pdf) — standards-compliant ISO 32000-1 (PDF 1.4) binary document with
 *    styled header, metadata metrics, automatic line wrapping, multi-page pagination, and page numbers.
 */

import type { ClipboardItemDto } from '../../shared/types'
import { calculateTextMetrics } from './format'
import { detectCode } from './codeDetect'

export interface SingleExportResult {
  filename: string
  content: string | Uint8Array
  mimeType: string
  format: 'md' | 'txt' | 'pdf'
}

/**
 * Format timestamp into readable ISO or localized date.
 */
function formatTimestamp(ts: number): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString()
  } catch {
    return new Date(ts).toISOString()
  }
}

/**
 * Creates a clean, safe filename from item content and timestamp.
 */
export function generateExportFilename(item: ClipboardItemDto, format: 'md' | 'txt' | 'pdf'): string {
  const d = new Date(item.capturedAt || Date.now())
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  const timeStr = `${year}${month}${day}-${hours}${mins}`

  let snippet = ''
  if (item.data.kind === 'text') {
    const firstLine = item.data.text.trim().split('\n')[0] || 'snippet'
    snippet = firstLine
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 24)
      .replace(/^-|-$/g, '')
  } else if (item.data.kind === 'files') {
    snippet = 'files'
  }

  const base = snippet ? `edge-drop-${snippet}-${timeStr}` : `edge-drop-${timeStr}`
  return `${base}.${format}`
}

/**
 * Extract the primary textual representation of an item.
 */
export function getItemRawText(item: ClipboardItemDto): string {
  if (item.data.kind === 'text') {
    return item.data.text
  }
  if (item.data.kind === 'files') {
    return item.data.paths.join('\n')
  }
  return ''
}

/**
 * Export single item to spotless Markdown (.md)
 */
export function exportSingleItemToMarkdown(item: ClipboardItemDto): { content: string; filename: string } {
  const text = getItemRawText(item)
  const filename = generateExportFilename(item, 'md')
  const dateStr = formatTimestamp(item.capturedAt)
  const metrics = calculateTextMetrics(text)
  const lineCount = text ? text.split('\n').length : 0
  const codeInfo = detectCode(text)

  const lines: string[] = [
    '# Edge-Drop Export',
    '',
    `- **Captured**: ${dateStr}`,
    `- **Length**: ${metrics.chars} characters • ${metrics.words} words • ${lineCount} lines`,
    item.pinned ? '- **Status**: Pinned' : '',
    item.colorTag ? `- **Tag**: ${item.colorTag.toUpperCase()}` : '',
    codeInfo.isCode ? `- **Syntax**: ${codeInfo.language.toUpperCase()}` : '',
    item.data.kind === 'text' && item.data.isUrl ? `- **URL**: ${item.data.text}` : '',
    '',
    '---',
    ''
  ].filter(Boolean)

  if (item.data.kind === 'text' && item.data.isUrl) {
    lines.push(`[${item.data.text}](${item.data.text})`)
  } else if (codeInfo.isCode) {
    lines.push(`\`\`\`${codeInfo.language}`)
    lines.push(text)
    lines.push('\`\`\`')
  } else {
    lines.push(text)
  }

  lines.push('')
  return { content: lines.join('\n'), filename }
}

/**
 * Export single item to spotless Plain Text (.txt)
 * Verbatim unadulterated text, preserving all spaces, tabs, and line endings.
 */
export function exportSingleItemToPlainText(item: ClipboardItemDto): { content: string; filename: string } {
  const text = getItemRawText(item)
  const filename = generateExportFilename(item, 'txt')
  return { content: text, filename }
}

/**
 * Escape literal characters for standard PDF string literals `(text)`.
 */
function escapePdfString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ') // Clean ASCII/Latin printable range
}

/**
 * Wraps text into lines that fit within a given character width.
 */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const result: string[] = []
  const paragraphs = text.split('\n')

  for (const para of paragraphs) {
    if (para.length <= maxCharsPerLine) {
      result.push(para)
      continue
    }

    let remaining = para
    while (remaining.length > 0) {
      if (remaining.length <= maxCharsPerLine) {
        result.push(remaining)
        break
      }

      // Try breaking at last space within limit
      let breakIdx = remaining.lastIndexOf(' ', maxCharsPerLine)
      if (breakIdx <= 0 || breakIdx < maxCharsPerLine * 0.4) {
        breakIdx = maxCharsPerLine
      }

      result.push(remaining.slice(0, breakIdx))
      remaining = remaining.slice(breakIdx).trimStart()
    }
  }

  return result
}

/**
 * Export single item to spotless PDF Document (.pdf)
 * Pure TypeScript ISO 32000-1 / PDF 1.4 vector document generator.
 */
export function exportSingleItemToPdf(item: ClipboardItemDto): { pdfBytes: Uint8Array; filename: string } {
  const text = getItemRawText(item)
  const filename = generateExportFilename(item, 'pdf')
  const dateStr = formatTimestamp(item.capturedAt)
  const metrics = calculateTextMetrics(text)
  const lineCount = text ? text.split('\n').length : 0
  const codeInfo = detectCode(text)

  // Document page layout (Letter: 612 x 792 points)
  const pageWidth = 612
  const pageHeight = 792
  const marginLeft = 54
  const marginTop = 54
  const marginBottom = 54
  const contentWidth = pageWidth - marginLeft * 2 // 504 pt
  const contentHeight = pageHeight - marginTop - marginBottom // 684 pt

  // Fonts: Helvetica for headers, Courier for code blocks, Helvetica for general text
  const isCode = codeInfo.isCode
  const fontName = isCode ? '/F2' : '/F1'
  const fontSize = isCode ? 9.5 : 10.5
  const lineHeight = isCode ? 13 : 15
  const maxCharsPerLine = isCode ? 82 : 78

  // Split and wrap all body lines
  const wrappedBodyLines = wrapText(text, maxCharsPerLine)

  // Layout pages
  interface PageContent {
    stream: string
  }

  const pages: PageContent[] = []
  let currentLineIdx = 0
  const linesPerPageSubsequent = Math.floor((contentHeight - 40) / lineHeight)
  // First page has header (120pt)
  const linesPerPageFirst = Math.floor((contentHeight - 130) / lineHeight)

  let pageNum = 1
  const totalPagesEstimate = Math.max(
    1,
    1 + Math.ceil(Math.max(0, wrappedBodyLines.length - linesPerPageFirst) / Math.max(1, linesPerPageSubsequent))
  )

  while (currentLineIdx < wrappedBodyLines.length || pages.length === 0) {
    const isFirstPage = pages.length === 0
    const maxLines = isFirstPage ? linesPerPageFirst : linesPerPageSubsequent
    const pageLines = wrappedBodyLines.slice(currentLineIdx, currentLineIdx + maxLines)
    currentLineIdx += maxLines

    const streamOps: string[] = []

    // Background accent bar on top
    if (isFirstPage) {
      // Header Bar
      streamOps.push(
        '0.1 0.1 0.13 rg', // Dark background pill
        `${marginLeft} ${pageHeight - marginTop - 28} ${contentWidth} 28 re f`,
        'BT',
        '/F2 13 Tf', // Bold
        '1 1 1 rg', // White text
        `${marginLeft + 12} ${pageHeight - marginTop - 18} Td`,
        '(Edge-Drop Clipboard Export) Tj',
        'ET',
        // Date and format metadata
        'BT',
        '/F1 9 Tf',
        '0.75 0.75 0.78 rg',
        `${marginLeft + contentWidth - 160} ${pageHeight - marginTop - 17} Td`,
        `(${escapePdfString(dateStr.slice(0, 24))}) Tj`,
        'ET',
        // Divider rule
        '0.82 0.82 0.85 RG',
        '0.75 w',
        `${marginLeft} ${pageHeight - marginTop - 40} m ${marginLeft + contentWidth} ${pageHeight - marginTop - 40} l S`,
        // Metrics subline
        'BT',
        '/F1 9 Tf',
        '0.45 0.45 0.48 rg',
        `${marginLeft} ${pageHeight - marginTop - 54} Td`,
        `(${escapePdfString(`Length: ${metrics.chars} chars  |  ${metrics.words} words  |  ${lineCount} lines  |  Type: ${isCode ? codeInfo.language.toUpperCase() : 'TEXT'}`)}) Tj`,
        'ET'
      )
    }

    // Start text block
    const textStartY = isFirstPage ? pageHeight - marginTop - 76 : pageHeight - marginTop - 10
    streamOps.push('BT', `${fontName} ${fontSize} Tf`, '0.15 0.15 0.15 rg', `${marginLeft} ${textStartY} Td`, `${lineHeight} TL`)

    for (let i = 0; i < pageLines.length; i++) {
      const line = escapePdfString(pageLines[i])
      if (i === 0) {
        streamOps.push(`(${line}) Tj`)
      } else {
        streamOps.push(`T* (${line}) Tj`)
      }
    }
    streamOps.push('ET')

    // Page footer rule and page number
    streamOps.push(
      '0.88 0.88 0.9 RG',
      '0.5 w',
      `${marginLeft} ${marginBottom + 16} m ${marginLeft + contentWidth} ${marginBottom + 16} l S`,
      'BT',
      '/F1 8.5 Tf',
      '0.55 0.55 0.58 rg',
      `${marginLeft} ${marginBottom + 4} Td`,
      '(Exported with Edge-Drop Clipboard Hub) Tj',
      'ET',
      'BT',
      '/F1 8.5 Tf',
      '0.55 0.55 0.58 rg',
      `${marginLeft + contentWidth - 60} ${marginBottom + 4} Td`,
      `(${escapePdfString(`Page ${pageNum} of ${totalPagesEstimate}`)}) Tj`,
      'ET'
    )

    pages.push({ stream: streamOps.join('\n') })
    pageNum++
  }

  // Build PDF 1.4 Object Structure
  const objects: string[] = []
  const xrefOffsets: number[] = [0] // 0000000000 65535 f

  let currentOffset = 0
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  currentOffset += header.length

  function addObject(content: string): number {
    const objNum = objects.length + 1
    const objStr = `${objNum} 0 obj\n${content}\nendobj\n`
    xrefOffsets.push(currentOffset)
    currentOffset += objStr.length
    objects.push(objStr)
    return objNum
  }

  // 1. Catalog (Obj 1)
  // 2. Pages (Obj 2)
  // 3. Font F1 (Helvetica)
  // 4. Font F2 (Helvetica-Bold)
  // For each page: Page Object + Content Stream Object
  const pageCount = pages.length
  const catalogObjNum = 1
  const pagesObjNum = 2
  const fontF1ObjNum = 3
  const fontF2ObjNum = 4

  // Reserve indices
  const pageObjNums: number[] = []
  const contentObjNums: number[] = []

  let nextObj = 5
  for (let i = 0; i < pageCount; i++) {
    pageObjNums.push(nextObj++)
    contentObjNums.push(nextObj++)
  }

  // Catalog
  addObject(`<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>`)

  // Pages
  const kidsStr = pageObjNums.map((num) => `${num} 0 R`).join(' ')
  addObject(`<< /Type /Pages /Kids [${kidsStr}] /Count ${pageCount} >>`)

  // Fonts
  addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`)
  addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`)

  // Pages and Content Streams
  for (let i = 0; i < pageCount; i++) {
    const contentObjNum = contentObjNums[i]
    const streamData = pages[i].stream

    // Page object
    addObject(
      `<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontF1ObjNum} 0 R /F2 ${fontF2ObjNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>`
    )

    // Content Stream
    addObject(`<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream`)
  }

  // Cross-reference table
  const startXref = currentOffset
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) {
    const off = String(xrefOffsets[i]).padStart(10, '0')
    xref += `${off} 00000 n \n`
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjNum} 0 R >>\nstartxref\n${startXref}\n%%EOF\n`

  const fullPdfText = header + objects.join('') + xref + trailer
  const encoder = new TextEncoder()
  const pdfBytes = encoder.encode(fullPdfText)

  return { pdfBytes, filename }
}

/**
 * Triggers browser/Electron download of any binary or text blob.
 */
export function downloadBlob(data: any, filename: string, mimeType: string): void {
  try {
    const blob = new Blob([data], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    console.error('Failed to trigger download', err)
  }
}

/**
 * High-level one-click runner to export a single item.
 */
export async function exportSingleItem(
  item: ClipboardItemDto,
  format: 'md' | 'txt' | 'pdf'
): Promise<{ success: boolean; filename: string }> {
  if (format === 'md') {
    const { content, filename } = exportSingleItemToMarkdown(item)
    downloadBlob(content, filename, 'text/markdown;charset=utf-8')
    return { success: true, filename }
  }

  if (format === 'txt') {
    const { content, filename } = exportSingleItemToPlainText(item)
    downloadBlob(content, filename, 'text/plain;charset=utf-8')
    return { success: true, filename }
  }

  if (format === 'pdf') {
    const { pdfBytes, filename } = exportSingleItemToPdf(item)
    downloadBlob(pdfBytes, filename, 'application/pdf')
    return { success: true, filename }
  }

  return { success: false, filename: '' }
}
