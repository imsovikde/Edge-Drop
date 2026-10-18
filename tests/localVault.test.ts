import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type { ClipboardItem, Settings } from '../shared/types'

const testDir = join(tmpdir(), `vault-test-${Date.now()}`)
const testImagesDir = join(testDir, 'images')

let mockItems: ClipboardItem[] = []
let mockSettings: Partial<Settings> = { theme: 'dark', hotZoneHeight: 200 }

vi.mock('../electron/store/paths', () => ({
  PATHS: {
    imagesDir: () => testImagesDir,
    payloadsDir: () => join(testDir, 'payloads')
  }
}))

vi.mock('../electron/main/state', () => ({
  getStore: () => ({
    list: () => mockItems,
    upsertRemoteItem: (item: ClipboardItem) => {
      mockItems.push(item)
    }
  }),
  loadSettings: () => mockSettings,
  saveSettings: (s: Settings) => {
    mockSettings = s
  },
  pushState: {
    items: vi.fn(),
    settings: vi.fn()
  }
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => testDir
  },
  safeStorage: {
    isEncryptionAvailable: () => false
  }
}))

import { localVault } from '../electron/backup/localVault'

describe('LocalVault Snapshot Archive Engine (.edvault)', () => {
  beforeEach(() => {
    mkdirSync(testImagesDir, { recursive: true })
    mockItems = [
      {
        id: 'item-1',
        type: 'text',
        data: 'Edge-Drop Test Item',
        timestamp: Date.now(),
        preview: 'Edge-Drop Test Item',
        favorite: false
      }
    ]
    // Write a dummy image
    writeFileSync(join(testImagesDir, 'sample.png'), Buffer.from('fake-image-png-content'))
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      try {
        rmSync(testDir, { recursive: true, force: true })
      } catch {}
    }
  })

  it('exports a valid .edvault compressed archive and imports it cleanly', async () => {
    const vaultPath = join(testDir, 'test-vault.edvault')
    const exportRes = await localVault.exportSnapshot(vaultPath)

    expect(exportRes.success).toBe(true)
    expect(exportRes.itemCount).toBe(1)
    expect(exportRes.imageCount).toBe(1)
    expect(existsSync(vaultPath)).toBe(true)

    // Clear state
    mockItems = []
    const imgPath = join(testImagesDir, 'sample.png')
    if (existsSync(imgPath)) {
      rmSync(imgPath)
    }

    // Import snapshot
    const importRes = await localVault.importSnapshot(vaultPath)
    expect(importRes.success).toBe(true)
    expect(importRes.restoredItems).toBe(1)
    expect(importRes.restoredImages).toBe(1)
    expect(mockItems.length).toBe(1)
    expect(mockItems[0].data).toBe('Edge-Drop Test Item')
    expect(existsSync(imgPath)).toBe(true)
  })

  it('rejects invalid or missing vault archive on import', async () => {
    await expect(localVault.importSnapshot(join(testDir, 'non-existent.edvault'))).rejects.toThrow(
      /File does not exist/
    )
  })
})
