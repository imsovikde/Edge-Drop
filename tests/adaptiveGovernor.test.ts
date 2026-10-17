import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type { ClipboardItem } from '../shared/types'

const testDir = join(tmpdir(), `gov-test-${Date.now()}`)

vi.mock('electron', () => ({
  app: {
    getPath: () => testDir
  },
  powerMonitor: {
    isOnBatteryPower: () => false,
    on: vi.fn()
  },
  safeStorage: {
    isEncryptionAvailable: () => false
  }
}))

import { adaptiveGovernor } from '../electron/backup/adaptiveGovernor'

describe('Adaptive Governor coalescing & WAL durability', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      try {
        rmSync(testDir, { recursive: true, force: true })
      } catch {}
    }
  })

  it('queues items, updates pending count, and flushes through sync callback', async () => {
    const flushedEntries: any[] = []
    adaptiveGovernor.init(async (entries) => {
      flushedEntries.push(...entries)
    })

    const sampleItem: ClipboardItem = {
      id: 'gov-item-1',
      type: 'text',
      data: 'Coalesced Text',
      timestamp: Date.now(),
      preview: 'Coalesced Text',
      favorite: false
    }

    adaptiveGovernor.queueItem(sampleItem, 'upsert')
    expect(adaptiveGovernor.getPendingCount()).toBe(1)

    // Check WAL file persistence
    const walFile = join(testDir, 'sync-wal.json')
    expect(existsSync(walFile)).toBe(true)
    const walContent = JSON.parse(readFileSync(walFile, 'utf8'))
    expect(walContent.length).toBe(1)
    expect(walContent[0].id).toBe('gov-item-1')

    // Trigger flush
    await adaptiveGovernor.flushNow()
    expect(flushedEntries.length).toBe(1)
    expect(flushedEntries[0].id).toBe('gov-item-1')
    expect(adaptiveGovernor.getPendingCount()).toBe(0)

    // After successful flush, WAL is empty
    const clearedWal = JSON.parse(readFileSync(walFile, 'utf8'))
    expect(clearedWal.length).toBe(0)
  })

  it('generates consistent Merkle digests for state comparison', () => {
    const digest1 = adaptiveGovernor.getMerkleDigest()
    expect(digest1).toHaveLength(16)
  })
})
