/**
 * Edge-Drop Pure TypeScript QR Code Generator (Model 2, Byte Mode, EC Level M).
 * Zero runtime npm dependencies. Compliant with ISO/IEC 18004.
 */

// Galois Field GF(256) arithmetic with primitive polynomial 0x11D (x^8 + x^4 + x^3 + x^2 + 1)
const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)

let gfVal = 1
for (let i = 0; i < 255; i++) {
  GF_EXP[i] = gfVal
  GF_LOG[gfVal] = i
  gfVal <<= 1
  if (gfVal & 0x100) gfVal ^= 0x11d
}
for (let i = 255; i < 512; i++) {
  GF_EXP[i] = GF_EXP[i - 255]
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

/** Reed-Solomon generator polynomial of degree n */
function rsGenPoly(n: number): number[] {
  let g = [1]
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0)
    const alpha_i = GF_EXP[i]
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j]
      next[j + 1] ^= gfMul(g[j], alpha_i)
    }
    g = next
  }
  return g
}

/** Compute Reed-Solomon error correction codewords */
function rsCompute(data: number[], numEc: number): Uint8Array {
  const gen = rsGenPoly(numEc)
  const rem = new Uint8Array(numEc)
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0]
    for (let j = 0; j < numEc - 1; j++) {
      rem[j] = rem[j + 1] ^ gfMul(gen[j + 1], factor)
    }
    rem[numEc - 1] = gfMul(gen[numEc], factor)
  }
  return rem
}

interface EcSpec {
  v: number
  total: number
  ec: number
  g1: [number, number]
  g2: [number, number]
}

// Standard ISO/IEC 18004 Error Correction Level M specifications (Versions 1-10)
const EC_SPECS_M: (EcSpec | null)[] = [
  null,
  { v: 1, total: 26, ec: 10, g1: [1, 16], g2: [0, 0] },
  { v: 2, total: 44, ec: 16, g1: [1, 28], g2: [0, 0] },
  { v: 3, total: 70, ec: 26, g1: [1, 44], g2: [0, 0] },
  { v: 4, total: 100, ec: 18, g1: [2, 32], g2: [0, 0] },
  { v: 5, total: 134, ec: 24, g1: [2, 43], g2: [0, 0] },
  { v: 6, total: 172, ec: 16, g1: [4, 27], g2: [0, 0] },
  { v: 7, total: 196, ec: 18, g1: [4, 31], g2: [0, 0] },
  { v: 8, total: 242, ec: 22, g1: [2, 38], g2: [2, 39] },
  { v: 9, total: 292, ec: 22, g1: [3, 36], g2: [2, 37] },
  { v: 10, total: 346, ec: 26, g1: [4, 43], g2: [1, 44] }
]

// Alignment pattern center coordinates (Versions 1-10)
const ALIGNMENT_COORDS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
]

// 18-bit version information for V7-V10
const VERSION_INFO: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3
}

// Remainder bits per version
const REMAINDER_BITS = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0]

// Pre-computed 15-bit format strings for EC Level M (XOR mask 0x5412 applied)
const FORMAT_INFO_M = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0
]

export interface QrCodeResult {
  version: number
  size: number
  mask: number
  matrix: boolean[][]
  truncated: boolean
}

export interface QrSvgOptions {
  size?: number
  margin?: number
  darkColor?: string
  lightColor?: string
}

/**
 * Automatically select the minimum QR version (1-10) that can accommodate the byte length.
 */
export function selectQrVersion(byteCount: number): { version: number; truncated: boolean } {
  for (let v = 1; v <= 10; v++) {
    const spec = EC_SPECS_M[v]!
    const totalData = spec.g1[0] * spec.g1[1] + spec.g2[0] * spec.g2[1]
    const headerBits = v < 10 ? 12 : 20
    const maxBytes = Math.floor((totalData * 8 - headerBits) / 8)
    if (byteCount <= maxBytes) {
      return { version: v, truncated: false }
    }
  }
  return { version: 10, truncated: true }
}

/**
 * Generate a complete QR Code Model 2 matrix for any text or URL string.
 */
export function generateQrCode(text: string): QrCodeResult {
  const bytes = new TextEncoder().encode(text)
  const { version, truncated } = selectQrVersion(bytes.length)
  const spec = EC_SPECS_M[version]!
  const totalData = spec.g1[0] * spec.g1[1] + spec.g2[0] * spec.g2[1]
  const size = 17 + 4 * version

  // Encode Bit Stream
  const bitBuf: number[] = []
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuf.push((val >> i) & 1)
    }
  }

  // 1. Mode indicator: 0100 (Byte mode)
  pushBits(4, 4)

  // 2. Character count indicator
  const maxBytes = Math.floor((totalData * 8 - (version < 10 ? 12 : 20)) / 8)
  const dataLen = Math.min(bytes.length, maxBytes)
  pushBits(dataLen, version < 10 ? 8 : 16)

  // 3. Data bytes
  for (let i = 0; i < dataLen; i++) {
    pushBits(bytes[i], 8)
  }

  // 4. Terminator (up to 4 zero bits)
  const totalBits = totalData * 8
  const termLen = Math.min(4, totalBits - bitBuf.length)
  pushBits(0, termLen)

  // 5. Pad to byte boundary
  while (bitBuf.length % 8 !== 0) {
    bitBuf.push(0)
  }

  // 6. Alternate pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11]
  let padIdx = 0
  while (bitBuf.length < totalBits) {
    pushBits(padBytes[padIdx % 2], 8)
    padIdx++
  }

  // Convert bits to data codewords
  const dataCodewords: number[] = []
  for (let i = 0; i < bitBuf.length; i += 8) {
    let byte = 0
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bitBuf[i + b]
    }
    dataCodewords.push(byte)
  }

  // Split into RS blocks
  const blocks: { data: number[]; ec: Uint8Array }[] = []
  let offset = 0
  for (let b = 0; b < spec.g1[0]; b++) {
    const d = dataCodewords.slice(offset, offset + spec.g1[1])
    offset += spec.g1[1]
    blocks.push({ data: d, ec: rsCompute(d, spec.ec) })
  }
  for (let b = 0; b < spec.g2[0]; b++) {
    const d = dataCodewords.slice(offset, offset + spec.g2[1])
    offset += spec.g2[1]
    blocks.push({ data: d, ec: rsCompute(d, spec.ec) })
  }

  // Interleave data codewords
  const finalCodewords: number[] = []
  const maxDataLen = Math.max(spec.g1[1], spec.g2[1])
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of blocks) {
      if (i < blk.data.length) finalCodewords.push(blk.data[i])
    }
  }

  // Interleave error correction codewords
  for (let i = 0; i < spec.ec; i++) {
    for (const blk of blocks) {
      finalCodewords.push(blk.ec[i])
    }
  }

  // Convert to bit stream
  const finalBits: number[] = []
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((cw >> i) & 1)
    }
  }

  // Remainder bits
  for (let i = 0; i < REMAINDER_BITS[version]; i++) {
    finalBits.push(0)
  }

  // Matrix and reservation map
  const matrix: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))

  function setModule(r: number, c: number, val: boolean, func = false) {
    matrix[r][c] = val
    if (func) isFunction[r][c] = true
  }

  // Place 7x7 Finder Patterns and Separators
  function placeFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r
        const nc = col + c
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (r >= 0 && r < 7 && c >= 0 && c < 7) {
            const isDark = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
            setModule(nr, nc, isDark, true)
          } else {
            setModule(nr, nc, false, true) // separator
          }
        }
      }
    }
  }

  placeFinder(0, 0)
  placeFinder(0, size - 7)
  placeFinder(size - 7, 0)

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6][i]) setModule(6, i, i % 2 === 0, true)
    if (!isFunction[i][6]) setModule(i, 6, i % 2 === 0, true)
  }

  // Dark module
  setModule(4 * version + 9, 8, true, true)

  // Alignment patterns (Version >= 2)
  const alignCoords = ALIGNMENT_COORDS[version] || []
  for (const r of alignCoords) {
    for (const c of alignCoords) {
      if (isFunction[r][c]) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isDark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)
          setModule(r + dr, c + dc, isDark, true)
        }
      }
    }
  }

  // Format information areas
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true
    if (!isFunction[i][8]) isFunction[i][8] = true
  }
  for (let i = size - 8; i < size; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true
    if (!isFunction[i][8]) isFunction[i][8] = true
  }

  // Version information areas (Version >= 7)
  if (version >= 7) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        isFunction[r][size - 11 + c] = true
        isFunction[size - 11 + c][r] = true
      }
    }
  }

  // Place Data Bits (Zig-Zag column traversal right-to-left)
  let bitIndex = 0
  let upwards = true
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c-- // Skip vertical timing pattern column
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i)

    for (const r of rows) {
      for (const colOffset of [0, 1]) {
        const col = c - colOffset
        if (!isFunction[r][col]) {
          const bit = bitIndex < finalBits.length ? finalBits[bitIndex++] : 0
          matrix[r][col] = bit === 1
        }
      }
    }
    upwards = !upwards
  }

  // Evaluate 8 Mask Patterns to find optimal mask
  function isMaskBit(r: number, c: number, pattern: number): boolean {
    switch (pattern) {
      case 0: return (r + c) % 2 === 0
      case 1: return r % 2 === 0
      case 2: return c % 3 === 0
      case 3: return (r + c) % 3 === 0
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
      case 7: return (((r * c) % 3) + ((r + c) % 2)) % 2 === 0
      default: return false
    }
  }

  function evaluatePenalty(testMatrix: boolean[][]): number {
    let penalty = 0
    // N1: 5 or more consecutive modules in row/column
    for (let r = 0; r < size; r++) {
      let run = 1
      for (let c = 1; c < size; c++) {
        if (testMatrix[r][c] === testMatrix[r][c - 1]) run++
        else {
          if (run >= 5) penalty += 3 + (run - 5)
          run = 1
        }
      }
      if (run >= 5) penalty += 3 + (run - 5)
    }
    for (let c = 0; c < size; c++) {
      let run = 1
      for (let r = 1; r < size; r++) {
        if (testMatrix[r][c] === testMatrix[r - 1][c]) run++
        else {
          if (run >= 5) penalty += 3 + (run - 5)
          run = 1
        }
      }
      if (run >= 5) penalty += 3 + (run - 5)
    }
    // N2: 2x2 blocks of same color
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const val = testMatrix[r][c]
        if (testMatrix[r + 1][c] === val && testMatrix[r][c + 1] === val && testMatrix[r + 1][c + 1] === val) {
          penalty += 3
        }
      }
    }
    // N4: Balance of dark / light modules
    let dark = 0
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (testMatrix[r][c]) dark++
      }
    }
    const ratio = (dark * 100) / (size * size)
    penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10
    return penalty
  }

  let bestMask = 0
  let minPenalty = Infinity
  let bestMatrix: boolean[][] = matrix

  for (let m = 0; m < 8; m++) {
    const candidate = matrix.map((row, r) =>
      row.map((val, c) => (isFunction[r][c] ? val : val !== isMaskBit(r, c, m)))
    )

    // Write format info bits for mask m
    const formatBits = FORMAT_INFO_M[m]
    for (let i = 0; i < 6; i++) candidate[8][i] = ((formatBits >> (14 - i)) & 1) === 1
    candidate[8][7] = ((formatBits >> 8) & 1) === 1
    candidate[8][8] = ((formatBits >> 7) & 1) === 1
    candidate[7][8] = ((formatBits >> 6) & 1) === 1
    for (let i = 0; i < 6; i++) candidate[5 - i][8] = ((formatBits >> (5 - i)) & 1) === 1

    for (let i = 0; i < 7; i++) candidate[size - 1 - i][8] = ((formatBits >> i) & 1) === 1
    for (let i = 0; i < 8; i++) candidate[8][size - 8 + i] = ((formatBits >> (7 + i)) & 1) === 1

    // Write version info bits for V >= 7
    if (version >= 7) {
      const vBits = VERSION_INFO[version]
      let bit = 0
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          const isDark = ((vBits >> bit) & 1) === 1
          candidate[size - 11 + j][i] = isDark
          candidate[i][size - 11 + j] = isDark
          bit++
        }
      }
    }

    const pen = evaluatePenalty(candidate)
    if (pen < minPenalty) {
      minPenalty = pen
      bestMask = m
      bestMatrix = candidate
    }
  }

  return {
    version,
    size,
    mask: bestMask,
    matrix: bestMatrix,
    truncated
  }
}

/**
 * Generate scalable SVG string representing the QR code.
 */
export function generateQrSvg(text: string, options: QrSvgOptions = {}): string {
  const {
    size = 220,
    margin = 2,
    darkColor = '#000000',
    lightColor = '#ffffff'
  } = options

  const qr = generateQrCode(text)
  const moduleCount = qr.size + margin * 2

  let pathData = ''
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.matrix[r][c]) {
        const x = c + margin
        const y = r + margin
        pathData += `M${x},${y}h1v1h-1z `
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${moduleCount} ${moduleCount}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <rect width="100%" height="100%" fill="${lightColor}"/>
  <path d="${pathData.trim()}" fill="${darkColor}"/>
</svg>`
}

/**
 * Generate a data URL of the SVG QR Code suitable for <img> src or clipboard.
 */
export function generateQrDataUrl(text: string, options: QrSvgOptions = {}): string {
  const svg = generateQrSvg(text, options)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
