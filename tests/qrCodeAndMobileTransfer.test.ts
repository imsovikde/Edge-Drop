import { describe, it, expect } from 'vitest'
import {
  generateQrCode,
  generateQrSvg,
  generateQrDataUrl,
  selectQrVersion
} from '../src/lib/qrCode'
import { calculateTextMetrics } from '../src/lib/format'

describe('Pure TypeScript QR Code Generator (Model 2, EC Level M)', () => {
  it('selects appropriate version based on byte payload length', () => {
    // V1 handles up to 14 bytes in EC M
    const v1 = selectQrVersion(10)
    expect(v1.version).toBe(1)
    expect(v1.truncated).toBe(false)

    // Standard 35-character URL fits in V3 (capacity 42 bytes)
    const v3 = selectQrVersion(35)
    expect(v3.version).toBe(3)
    expect(v3.truncated).toBe(false)

    // 120-byte text fits in V7 (capacity 122 bytes)
    const v7 = selectQrVersion(120)
    expect(v7.version).toBe(7)
    expect(v7.truncated).toBe(false)

    // Payload exceeding V10 capacity (213 bytes) clamps to V10 and flags truncated
    const overflow = selectQrVersion(300)
    expect(overflow.version).toBe(10)
    expect(overflow.truncated).toBe(true)
  })

  it('generates exact matrix dimensions for QR Model 2 (size = 17 + 4 * version)', () => {
    const qrShort = generateQrCode('Hello')
    expect(qrShort.version).toBe(1)
    expect(qrShort.size).toBe(21) // 17 + 4 * 1
    expect(qrShort.matrix.length).toBe(21)
    expect(qrShort.matrix[0].length).toBe(21)

    const qrUrl = generateQrCode('https://github.com/imsovikde/Edge-Drop')
    expect(qrUrl.version).toBe(3)
    expect(qrUrl.size).toBe(29) // 17 + 4 * 3
    expect(qrUrl.matrix.length).toBe(29)
    expect(qrUrl.matrix[0].length).toBe(29)
  })

  it('correctly constructs standard 7x7 finder patterns and separators at the three corners', () => {
    const qr = generateQrCode('https://edgedrop.app')
    const size = qr.size

    // Verify finder pattern core structure: outer 7x7 square, 5x5 white border, 3x3 dark center
    const checkFinder = (row: number, col: number) => {
      // Top and bottom borders of 7x7 must be dark
      for (let c = 0; c < 7; c++) {
        expect(qr.matrix[row][col + c]).toBe(true)
        expect(qr.matrix[row + 6][col + c]).toBe(true)
      }
      // Left and right borders of 7x7 must be dark
      for (let r = 0; r < 7; r++) {
        expect(qr.matrix[row + r][col]).toBe(true)
        expect(qr.matrix[row + r][col + 6]).toBe(true)
      }
      // 3x3 core must be dark
      for (let r = 2; r <= 4; r++) {
        for (let c = 2; c <= 4; c++) {
          expect(qr.matrix[row + r][col + c]).toBe(true)
        }
      }
      // Inner 1-module ring must be light
      expect(qr.matrix[row + 1][col + 1]).toBe(false)
      expect(qr.matrix[row + 1][col + 5]).toBe(false)
      expect(qr.matrix[row + 5][col + 1]).toBe(false)
      expect(qr.matrix[row + 5][col + 5]).toBe(false)
    }

    // Top-Left finder
    checkFinder(0, 0)
    // Top-Right finder
    checkFinder(0, size - 7)
    // Bottom-Left finder
    checkFinder(size - 7, 0)
  })

  it('renders alternating timing patterns along row 6 and column 6', () => {
    const qr = generateQrCode('https://github.com/imsovikde')
    const size = qr.size
    // Timing pattern runs between finders (indices 8 to size - 9)
    for (let i = 8; i < size - 8; i++) {
      const expected = i % 2 === 0
      expect(qr.matrix[6][i]).toBe(expected)
      expect(qr.matrix[i][6]).toBe(expected)
    }
  })

  it('places dark module at (4 * version + 9, 8)', () => {
    const qr = generateQrCode('Edge-Drop QR Code Test')
    const darkRow = 4 * qr.version + 9
    expect(qr.matrix[darkRow][8]).toBe(true)
  })

  it('renders valid, crisp SVG XML string with customized dimensions and colors', () => {
    const svg = generateQrSvg('https://github.com/imsovikde/Edge-Drop', {
      size: 250,
      margin: 3,
      darkColor: '#101014',
      lightColor: '#f4f4f5'
    })

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('width="250"')
    expect(svg).toContain('height="250"')
    expect(svg).toContain('fill="#f4f4f5"')
    expect(svg).toContain('fill="#101014"')
    expect(svg).toContain('<path d="M')
  })

  it('generates standard RFC-compliant data URL', () => {
    const dataUrl = generateQrDataUrl('https://example.com/share')
    expect(dataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(dataUrl).toContain('%3Csvg')
  })
})

describe('Text Metrics & Reading Telemetry', () => {
  it('handles empty or blank text gracefully', () => {
    const empty = calculateTextMetrics('')
    expect(empty.words).toBe(0)
    expect(empty.chars).toBe(0)
    expect(empty.readingTime).toBe('< 1 min')
    expect(empty.isNotable).toBe(false)

    const whitespace = calculateTextMetrics('   \n  \t ')
    expect(whitespace.words).toBe(0)
    expect(whitespace.chars).toBe(8)
    expect(whitespace.isNotable).toBe(false)
  })

  it('identifies short snippets as not notable to avoid UI clutter', () => {
    const short = calculateTextMetrics('npm install --save-dev vitest')
    expect(short.words).toBe(4)
    expect(short.chars).toBe(29)
    expect(short.readingTime).toBe('< 1 min')
    expect(short.isNotable).toBe(false)
  })

  it('accurately computes reading time and flags substantive text as notable', () => {
    const longText = `Edge-Drop is a high-performance clipboard manager designed with obsessive attention to craft.
It features low-latency keyboard navigation, instant full-text lifetime search across local SQLite and JSON archives,
automatic cryptographic secret masking, and real-time cloud synchronization backed by Firestore.
Every animation runs at 120 frames per second using physics-calibrated springs, providing fluid desktop responsiveness.`

    const metrics = calculateTextMetrics(longText)
    expect(metrics.words).toBeGreaterThan(45)
    expect(metrics.chars).toBeGreaterThan(200)
    expect(metrics.readingTime).toBe('< 1 min')
    expect(metrics.isNotable).toBe(true)

    // Test multi-minute text (> 400 words)
    const longWords = new Array(450).fill('word').join(' ')
    const multiMin = calculateTextMetrics(longWords)
    expect(multiMin.words).toBe(450)
    expect(multiMin.readingTime).toBe('3 min') // Math.ceil(450 / 200) = 3
    expect(multiMin.isNotable).toBe(true)
  })
})
