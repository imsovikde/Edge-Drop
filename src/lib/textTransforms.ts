/**
 * Zero-dependency Text Transformation & Cryptographic Hash Engine for Edge-Drop.
 * Provides high-speed casing, encoding, JSON formatting, whitespace normalization,
 * and pure Web Crypto SHA-256 hash generation for clipboard text cards.
 */

export type TransformId =
  | 'uppercase'
  | 'lowercase'
  | 'titlecase'
  | 'camelcase'
  | 'kebabcase'
  | 'snakecase'
  | 'base64encode'
  | 'base64decode'
  | 'urlencode'
  | 'urldecode'
  | 'jsonprettify'
  | 'jsonminify'
  | 'trimlines'
  | 'slugify'

export interface TransformDefinition {
  id: TransformId
  label: string
  category: 'case' | 'encoding' | 'json' | 'clean'
  description: string
}

export const TRANSFORMS: TransformDefinition[] = [
  { id: 'uppercase', label: 'UPPERCASE', category: 'case', description: 'Convert all letters to uppercase' },
  { id: 'lowercase', label: 'lowercase', category: 'case', description: 'Convert all letters to lowercase' },
  { id: 'titlecase', label: 'Title Case', category: 'case', description: 'Capitalize first letter of every word' },
  { id: 'camelcase', label: 'camelCase', category: 'case', description: 'Convert words to camelCase' },
  { id: 'kebabcase', label: 'kebab-case', category: 'case', description: 'Convert words to lowercase-hyphen' },
  { id: 'snakecase', label: 'snake_case', category: 'case', description: 'Convert words to lowercase-underscore' },
  { id: 'base64encode', label: 'Base64 Encode', category: 'encoding', description: 'UTF-8 safe Base64 string encoding' },
  { id: 'base64decode', label: 'Base64 Decode', category: 'encoding', description: 'Decode Base64 string to original text' },
  { id: 'urlencode', label: 'URL Encode', category: 'encoding', description: 'Percent-encode query parameters & characters' },
  { id: 'urldecode', label: 'URL Decode', category: 'encoding', description: 'Decode percent-encoded URL characters' },
  { id: 'jsonprettify', label: 'JSON Pretty Print', category: 'json', description: 'Indent JSON with 2 spaces for readability' },
  { id: 'jsonminify', label: 'JSON Minify', category: 'json', description: 'Strip all formatting whitespace from JSON' },
  { id: 'trimlines', label: 'Trim & Dedupe Lines', category: 'clean', description: 'Trim whitespace per line and collapse blank lines' },
  { id: 'slugify', label: 'URL Slug', category: 'clean', description: 'Create clean URL-friendly web slug' }
]

function splitWords(str: string): string[] {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function toTitleCase(text: string): string {
  return text.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
  })
}

export function toCamelCase(text: string): string {
  const words = splitWords(text)
  if (words.length === 0) return ''
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('')
}

export function toKebabCase(text: string): string {
  const words = splitWords(text)
  return words.map((w) => w.toLowerCase()).join('-')
}

export function toSnakeCase(text: string): string {
  const words = splitWords(text)
  return words.map((w) => w.toLowerCase()).join('_')
}

export function toBase64(text: string): string {
  try {
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  } catch {
    return text
  }
}

export function fromBase64(text: string): string {
  try {
    const binary = atob(text.trim())
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return text
  }
}

export function toUrlEncode(text: string): string {
  return encodeURIComponent(text)
}

export function fromUrlDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export function prettifyJson(text: string): { result: string; success: boolean } {
  try {
    const parsed = JSON.parse(text)
    return { result: JSON.stringify(parsed, null, 2), success: true }
  } catch {
    return { result: text, success: false }
  }
}

export function minifyJson(text: string): { result: string; success: boolean } {
  try {
    const parsed = JSON.parse(text)
    return { result: JSON.stringify(parsed), success: true }
  } catch {
    return { result: text, success: false }
  }
}

export function trimAndDedupeLines(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const deduped: string[] = []
  let prevEmpty = false

  for (const line of lines) {
    if (line === '') {
      if (!prevEmpty) {
        deduped.push('')
        prevEmpty = true
      }
    } else {
      deduped.push(line)
      prevEmpty = false
    }
  }

  return deduped.join('\n').trim()
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Executes a text transform by identifier.
 */
export function applyTransform(id: TransformId, text: string): string {
  switch (id) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'titlecase':
      return toTitleCase(text)
    case 'camelcase':
      return toCamelCase(text)
    case 'kebabcase':
      return toKebabCase(text)
    case 'snakecase':
      return toSnakeCase(text)
    case 'base64encode':
      return toBase64(text)
    case 'base64decode':
      return fromBase64(text)
    case 'urlencode':
      return toUrlEncode(text)
    case 'urldecode':
      return fromUrlDecode(text)
    case 'jsonprettify':
      return prettifyJson(text).result
    case 'jsonminify':
      return minifyJson(text).result
    case 'trimlines':
      return trimAndDedupeLines(text)
    case 'slugify':
      return slugify(text)
    default:
      return text
  }
}

/**
 * Generates cryptographic SHA-256 hex string using browser/Node Web Crypto API.
 */
export async function computeSha256(text: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(text)
    const cryptoObj = typeof globalThis !== 'undefined' ? (globalThis.crypto || (globalThis as any).msCrypto) : null
    if (cryptoObj && cryptoObj.subtle) {
      const hashBuffer = await cryptoObj.subtle.digest('SHA-256', bytes)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch (err) {
    console.error('SHA-256 calculation error:', err)
  }
  return ''
}

/**
 * Fast synchronous 32-bit CRC32 checksum for instantaneous badge preview.
 */
export function computeCrc32(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let crc = 0 ^ -1
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xff]
  }
  return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0')
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()
