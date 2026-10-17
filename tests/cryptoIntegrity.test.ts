import { describe, expect, it, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  computeSha256,
  sanitizeSafePath,
  atomicWriteFileSync,
  envelopeEncrypt,
  envelopeDecrypt
} from '../electron/backup/cryptoIntegrity'

describe('cryptoIntegrity engine', () => {
  const testDir = join(tmpdir(), `crypto-test-${Date.now()}`)

  afterEach(() => {
    if (existsSync(testDir)) {
      try {
        rmSync(testDir, { recursive: true, force: true })
      } catch {}
    }
  })

  it('computes exact SHA-256 hex digests for buffers and strings', () => {
    const text = 'Hello Edge-Drop cryptographic integrity'
    const hash1 = computeSha256(text)
    const hash2 = computeSha256(Buffer.from(text, 'utf8'))
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64)
  })

  it('sanitizes safe paths and rejects path traversal attempts', () => {
    mkdirSync(testDir, { recursive: true })
    const safeTarget = sanitizeSafePath(testDir, 'image-123.png')
    expect(safeTarget).toBe(join(testDir, 'image-123.png'))

    // Directory traversal attempt
    expect(() => {
      sanitizeSafePath(testDir, '../../etc/passwd')
    }).toThrow(/Path traversal attempt/)

    // Null byte injection attempt
    expect(() => {
      sanitizeSafePath(testDir, 'image\0.png')
    }).toThrow(/null bytes/)
  })

  it('atomically writes files and verifies written contents', () => {
    mkdirSync(testDir, { recursive: true })
    const filePath = join(testDir, 'test-atomic.txt')
    const content = Buffer.from('Atomic write contents with fsync and rename safety')

    atomicWriteFileSync(filePath, content)
    expect(existsSync(filePath)).toBe(true)
    const read = readFileSync(filePath)
    expect(read.toString('utf8')).toBe('Atomic write contents with fsync and rename safety')
  })

  it('performs envelope encryption and decryption round-trip', () => {
    const secretData = 'Edge-Drop secret payload 2026'
    const envelope = envelopeEncrypt(secretData)
    expect(typeof envelope).toBe('string')
    expect(envelope.length).toBeGreaterThan(28)

    const decrypted = envelopeDecrypt(envelope)
    expect(decrypted).toBe(secretData)
  })
})
