/**
 * Smart text transformations for clipboard content.
 */

export interface TransformResult {
  success: boolean
  result: string
  error?: string
}

/** Prettify JSON with 2-space indentation */
export function jsonPrettify(text: string): TransformResult {
  try {
    const parsed = JSON.parse(text)
    return {
      success: true,
      result: JSON.stringify(parsed, null, 2)
    }
  } catch (err: any) {
    return {
      success: false,
      result: text,
      error: err?.message || 'Invalid JSON'
    }
  }
}

/** Minify JSON into a single line */
export function jsonMinify(text: string): TransformResult {
  try {
    const parsed = JSON.parse(text)
    return {
      success: true,
      result: JSON.stringify(parsed)
    }
  } catch (err: any) {
    return {
      success: false,
      result: text,
      error: err?.message || 'Invalid JSON'
    }
  }
}

/** Split text into word tokens */
function getWords(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-–—/.\\]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** camelCase */
export function toCamelCase(text: string): string {
  const words = getWords(text)
  if (words.length === 0) return text
  return words
    .map((w, i) => {
      const lower = w.toLowerCase()
      if (i === 0) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
}

/** snake_case */
export function toSnakeCase(text: string): string {
  const words = getWords(text)
  if (words.length === 0) return text
  return words.map((w) => w.toLowerCase()).join('_')
}

/** kebab-case */
export function toKebabCase(text: string): string {
  const words = getWords(text)
  if (words.length === 0) return text
  return words.map((w) => w.toLowerCase()).join('-')
}

/** CONSTANT_CASE */
export function toConstantCase(text: string): string {
  const words = getWords(text)
  if (words.length === 0) return text
  return words.map((w) => w.toUpperCase()).join('_')
}

/** Title Case */
export function toTitleCase(text: string): string {
  const words = getWords(text)
  if (words.length === 0) return text
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** Trim whitespace on every line and collapse consecutive blank lines */
export function cleanWhitespace(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd())
  const result: string[] = []
  let prevBlank = false

  for (const line of lines) {
    const isBlank = line.trim() === ''
    if (isBlank) {
      if (!prevBlank) {
        result.push('')
        prevBlank = true
      }
    } else {
      result.push(line)
      prevBlank = false
    }
  }

  while (result.length > 0 && result[0] === '') {
    result.shift()
  }
  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop()
  }

  return result.join('\n')
}

/** Convert CSV or TSV to a Markdown table */
export function tableToMarkdown(text: string): TransformResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { success: false, result: text, error: 'Empty table' }
  }

  // Detect separator: Tab or Comma
  const sample = lines[0]
  const sep = sample.includes('\t') ? '\t' : ','

  const rows: string[][] = lines.map((line) => {
    if (sep === '\t') {
      return line.split('\t').map((c) => c.trim())
    }
    // Simple CSV parse handling quotes
    const cells: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    cells.push(current.trim())
    return cells
  })

  if (rows.length === 0 || rows[0].length < 2) {
    return { success: false, result: text, error: 'Insufficient columns for table' }
  }

  const colCount = Math.max(...rows.map((r) => r.length))
  const paddedRows = rows.map((r) => {
    const copy = [...r]
    while (copy.length < colCount) copy.push('')
    return copy
  })

  const colWidths = new Array(colCount).fill(3)
  for (const r of paddedRows) {
    for (let i = 0; i < colCount; i++) {
      colWidths[i] = Math.max(colWidths[i], r[i].length)
    }
  }

  const header = `| ${paddedRows[0].map((c, i) => c.padEnd(colWidths[i])).join(' | ')} |`
  const divider = `| ${colWidths.map((w) => '-'.repeat(w)).join(' | ')} |`
  const body = paddedRows
    .slice(1)
    .map((r) => `| ${r.map((c, i) => c.padEnd(colWidths[i])).join(' | ')} |`)
    .join('\n')

  const result = body ? `${header}\n${divider}\n${body}` : `${header}\n${divider}`
  return { success: true, result }
}
