import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { adaptiveGovernor } from '../electron/backup/adaptiveGovernor'
import type { ClipboardItem } from '../shared/types'

describe('Stability, Crash Prevention, and Taskbar Isolation Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adaptiveGovernor.dispose()
  })

  it('verifies adaptiveGovernor supports queueBatch with debounced WAL persistence', () => {
    const items: Array<{ item: ClipboardItem; action: 'upsert' | 'delete' }> = [
      {
        item: {
          id: 'test-batch-1',
          capturedAt: Date.now(),
          hitCount: 1,
          pinned: false,
          data: { kind: 'text', text: 'item 1' }
        },
        action: 'upsert'
      },
      {
        item: {
          id: 'test-batch-2',
          capturedAt: Date.now(),
          hitCount: 1,
          pinned: false,
          data: { kind: 'text', text: 'item 2' }
        },
        action: 'upsert'
      }
    ]

    adaptiveGovernor.queueBatch(items)
    expect(adaptiveGovernor.getPendingCount()).toBe(2)

    // Synchronous flush persistence test
    adaptiveGovernor.persistWalSync()
    expect(adaptiveGovernor.getPendingCount()).toBe(2)

    adaptiveGovernor.acknowledgeSuccess(['test-batch-1', 'test-batch-2'])
    expect(adaptiveGovernor.getPendingCount()).toBe(0)
  })

  it('verifies electron/backup/syncEngine.ts paginates Firestore remote documents', () => {
    const syncEnginePath = join(__dirname, '../electron/backup/syncEngine.ts')
    const content = readFileSync(syncEnginePath, 'utf8')
    expect(content).toContain('pageToken')
    expect(content).toContain("pageSize: '300'")
    expect(content).toContain('adaptiveGovernor.queueBatch')
  })

  it('verifies electron/store/ItemStore.ts preserves contentSig and cleans up dangling temp files', () => {
    const itemStorePath = join(__dirname, '../electron/store/ItemStore.ts')
    const content = readFileSync(itemStorePath, 'utf8')
    expect(content).toContain('contentSig: sig')
    expect(content).toContain('textData.contentSig')
    expect(content).toContain('cleanDanglingTemps')
  })

  it('verifies electron/main/window.ts enforces WS_EX_TOOLWINDOW and clears WS_EX_APPWINDOW', () => {
    const windowPath = join(__dirname, '../electron/main/window.ts')
    const content = readFileSync(windowPath, 'utf8')
    expect(content).toContain('WS_EX_TOOLWINDOW = 0x00000080')
    expect(content).toContain('WS_EX_APPWINDOW = 0x00040000')
    expect(content).toContain('(newExStyle | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW')
    expect(content).toContain('win.setSkipTaskbar(true)')
  })

  it('verifies electron/main/window.ts guards showInactive during ready-to-show and repositionWindow', () => {
    const windowPath = join(__dirname, '../electron/main/window.ts')
    const content = readFileSync(windowPath, 'utf8')
    expect(content).toContain('const hiddenLaunch = shouldStartHidden()')
    expect(content).toContain('if (!hiddenLaunch) {')
    expect(content).toContain('if (mainWindow.isVisible()) {')
    // No spurious popups on display changes
    expect(content).not.toContain("screen.on('display-added', () => {\n    handleDisplayChangeDebounced(true)")
  })

  it('verifies electron/main/loginItems.ts respects user preference and avoids 0.3.1 resurrection', () => {
    const loginItemsPath = join(__dirname, '../electron/main/loginItems.ts')
    const content = readFileSync(loginItemsPath, 'utf8')
    expect(content).not.toContain('Recovering launchAtLogin from existing active Run key')
    expect(content).toContain('const applied = await applyLaunchAtLogin(false)')
  })
})
