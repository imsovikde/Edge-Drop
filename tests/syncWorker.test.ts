import { describe, expect, it, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { syncWorker } from '../electron/backup/syncWorker'

describe('syncWorker offloading pool', () => {
  const testFile = join(tmpdir(), `worker-test-${Date.now()}.txt`)

  afterEach(() => {
    if (existsSync(testFile)) {
      try {
        rmSync(testFile, { force: true })
      } catch {}
    }
  })

  it('compresses and decompresses buffers with exact fidelity', async () => {
    const raw = 'Edge-Drop high-throughput synchronization payload for compression test'
    const compressed = await syncWorker.compressBuffer(raw)
    expect(compressed.length).toBeGreaterThan(0)

    const decompressed = await syncWorker.decompressBuffer(compressed)
    expect(decompressed.toString('utf8')).toBe(raw)
  })

  it('hashes files and buffers correctly', async () => {
    const content = 'Offloaded streaming file hash test'
    writeFileSync(testFile, content)

    const fileHash = await syncWorker.hashFile(testFile)
    const bufHash = syncWorker.hashBuffer(content)

    expect(fileHash).toBe(bufHash)
    expect(fileHash).toHaveLength(64)
  })
})
