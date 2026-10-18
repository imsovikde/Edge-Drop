/**
 * Export utilities for Edge-Drop clipboard history and vaults.
 * Generates structured Markdown (.md), clean JSON (.json), and Plain Text (.txt) exports.
 */

import type { ClipboardItemDto } from '../../shared/types'
import { basename } from './format'

/**
 * Format timestamp into readable localized date and time string.
 */
function formatTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return new Date(ts).toISOString()
  }
}

/**
 * Export items to a cleanly structured Markdown document.
 */
export function exportItemsToMarkdown(items: ClipboardItemDto[]): string {
  const timestamp = new Date().toISOString()
  const lines: string[] = [
    '# Edge-Drop Clipboard Archive',
    `*Exported on ${timestamp} • ${items.length} item${items.length === 1 ? '' : 's'}*`,
    '',
    '---',
    ''
  ]

  items.forEach((item, idx) => {
    const num = idx + 1
    const dateStr = formatTimestamp(item.capturedAt)
    const kind = item.data.kind.toUpperCase()
    const pinBadge = item.pinned ? ' [PINNED]' : ''
    const tagBadge = item.colorTag ? ` [TAG: ${item.colorTag.toUpperCase()}]` : ''

    lines.push(`## ${num}. ${kind}${pinBadge}${tagBadge} — ${dateStr}`)

    if (item.data.kind === 'text') {
      if (item.data.isUrl) {
        lines.push(`- **URL**: [${item.data.text}](${item.data.text})`)
      } else {
        lines.push('```text')
        lines.push(item.data.text)
        lines.push('```')
      }
    } else if (item.data.kind === 'files') {
      lines.push('**Files Staged:**')
      item.data.paths.forEach((p) => {
        lines.push(`- \`${basename(p)}\` (${p})`)
      })
    } else if (item.data.kind === 'image') {
      const name = item.data.fileName || `image-${item.data.imageId.slice(0, 8)}`
      const dims = `${item.data.width}×${item.data.height}`
      lines.push(`- **Image**: \`${name}\` (${dims})`)
    } else if (item.data.kind === 'image-collection') {
      lines.push(`**Image Stack (${item.data.images.length} photos):**`)
      item.data.images.forEach((img, i) => {
        const name = img.fileName || `photo-${i + 1}`
        lines.push(`- Photo ${i + 1}: \`${name}\` (${img.width}×${img.height})`)
      })
    }


    lines.push('')
    lines.push('---')
    lines.push('')
  })

  return lines.join('\n')
}

/**
 * Export items to standard JSON format.
 */
export function exportItemsToJson(items: ClipboardItemDto[]): string {
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    generator: 'Edge-Drop',
    itemCount: items.length,
    items: items.map((it) => ({
      id: it.id,
      capturedAt: it.capturedAt,
      pinned: !!it.pinned,
      colorTag: it.colorTag || null,
      kind: it.data.kind,
      data: it.data
    }))
  }

  return JSON.stringify(exportPayload, null, 2)
}

/**
 * Export items to plain text.
 */
export function exportItemsToPlainText(items: ClipboardItemDto[]): string {
  const blocks: string[] = []

  items.forEach((item, idx) => {
    const num = idx + 1
    const dateStr = formatTimestamp(item.capturedAt)
    let body = ''

    if (item.data.kind === 'text') {
      body = item.data.text
    } else if (item.data.kind === 'files') {
      body = item.data.paths.map((p) => basename(p)).join('\n')
    } else if (item.data.kind === 'image') {
      body = item.data.fileName || `Image (${item.data.width}×${item.data.height})`
    } else if (item.data.kind === 'image-collection') {
      body = item.data.images.map((img, i) => img.fileName || `Photo ${i + 1} (${img.width}×${img.height})`).join('\n')
    }


    blocks.push(`[${num}] ${item.data.kind.toUpperCase()} (${dateStr}):\n${body}`)
  })

  return blocks.join('\n\n========================================\n\n')
}

/**
 * Triggers a browser/Electron file download via an invisible anchor element.
 */
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  try {
    const blob = new Blob([content], { type: mimeType })
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
 * High-level helper to export clipboard history into the requested format.
 */
export function exportClipboardArchive(
  items: ClipboardItemDto[],
  format: 'md' | 'json' | 'txt'
): { success: boolean; filename: string } {
  const dateStr = new Date().toISOString().slice(0, 10)
  let content = ''
  let filename = `edge-drop-archive-${dateStr}.${format}`
  let mimeType = 'text/plain'

  switch (format) {
    case 'md':
      content = exportItemsToMarkdown(items)
      mimeType = 'text/markdown;charset=utf-8'
      break
    case 'json':
      content = exportItemsToJson(items)
      mimeType = 'application/json;charset=utf-8'
      break
    case 'txt':
      content = exportItemsToPlainText(items)
      mimeType = 'text/plain;charset=utf-8'
      break
  }

  downloadTextFile(content, filename, mimeType)
  return { success: true, filename }
}
