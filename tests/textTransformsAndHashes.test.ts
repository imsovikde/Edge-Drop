import { describe, it, expect } from 'vitest'
import {
  toTitleCase,
  toCamelCase,
  toKebabCase,
  toSnakeCase,
  toBase64,
  fromBase64,
  toUrlEncode,
  fromUrlDecode,
  prettifyJson,
  minifyJson,
  trimAndDedupeLines,
  slugify,
  applyTransform,
  computeSha256,
  computeCrc32
} from '../src/lib/textTransforms'

describe('Text Transformation Engine', () => {
  it('handles casing conversions with word boundaries and punctuation', () => {
    const input = 'hello world_from-edge drop 2026'

    expect(toTitleCase('hello world')).toBe('Hello World')
    expect(toCamelCase(input)).toBe('helloWorldFromEdgeDrop2026')
    expect(toKebabCase(input)).toBe('hello-world-from-edge-drop-2026')
    expect(toSnakeCase(input)).toBe('hello_world_from_edge_drop_2026')
  })

  it('performs lossless UTF-8 safe Base64 encoding and decoding', () => {
    const unicodeString = 'Edge-Drop ⚡ 🚀 2026'
    const encoded = toBase64(unicodeString)

    expect(encoded).not.toBe(unicodeString)
    expect(fromBase64(encoded)).toBe(unicodeString)

    // Gracefully handles corrupt Base64 without crashing
    expect(fromBase64('!!!NOT_BASE_64!!!')).toBe('!!!NOT_BASE_64!!!')
  })

  it('handles URL encoding and decoding', () => {
    const raw = 'name=Edge Drop&query=a+b=c&status=100%'
    const encoded = toUrlEncode(raw)

    expect(encoded).toContain('%20')
    expect(fromUrlDecode(encoded)).toBe(raw)
  })

  it('formats and minifies valid JSON while preserving invalid text', () => {
    const compact = '{"name":"Edge-Drop","version":"2.5.0","features":["sync","shelf"]}'
    const pretty = prettifyJson(compact)

    expect(pretty.success).toBe(true)
    expect(pretty.result).toContain('\n  "name": "Edge-Drop"')

    const minified = minifyJson(pretty.result)
    expect(minified.success).toBe(true)
    expect(minified.result).toBe(compact)

    // Invalid JSON
    const invalid = prettifyJson('not json')
    expect(invalid.success).toBe(false)
    expect(invalid.result).toBe('not json')
  })

  it('trims leading/trailing whitespace and collapses multiple blank lines', () => {
    const messy = '   line 1   \n\n\n\n   line 2   \n\n   line 3   '
    const cleaned = trimAndDedupeLines(messy)

    expect(cleaned).toBe('line 1\n\nline 2\n\nline 3')
  })

  it('generates clean URL slugs', () => {
    expect(slugify('Edge-Drop: The Ultimate Desktop Hub & Sync Engine!')).toBe('edge-drop-the-ultimate-desktop-hub-sync-engine')
  })

  it('applies transforms dynamically by ID', () => {
    expect(applyTransform('uppercase', 'abc')).toBe('ABC')
    expect(applyTransform('lowercase', 'XYZ')).toBe('xyz')
    expect(applyTransform('slugify', 'My Post Title')).toBe('my-post-title')
  })
})

describe('Cryptographic Hashes & Checksums', () => {
  it('computes accurate SHA-256 hex string for standard test strings', async () => {
    // Known SHA-256 for empty string: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const emptyHash = await computeSha256('')
    expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')

    // Known SHA-256 for "Edge-Drop"
    const hash = await computeSha256('Edge-Drop')
    expect(hash).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true)
  })

  it('computes instantaneous CRC-32 checksum', () => {
    const crc = computeCrc32('Edge-Drop')
    expect(crc).toHaveLength(8)
    expect(/^[0-9a-f]{8}$/.test(crc)).toBe(true)

    // Deterministic: same input gives exact same checksum
    expect(computeCrc32('Edge-Drop')).toBe(crc)
    expect(computeCrc32('Different')).not.toBe(crc)
  })
})
