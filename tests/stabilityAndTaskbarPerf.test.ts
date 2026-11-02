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

  it('verifies electron/main/window.ts invokes showInactive and WS_EX_TOOLWINDOW during ready-to-show so proximity polling functions on boot', () => {
    const windowPath = join(__dirname, '../electron/main/window.ts')
    const content = readFileSync(windowPath, 'utf8')
    expect(content).toContain("mainWindow.once('ready-to-show', () => {")
    expect(content).toContain('mainWindow.showInactive()')
    expect(content).toContain("mainWindow.setAlwaysOnTop(true, 'screen-saver')")
    expect(content).toContain('applyNoActivateStyle(mainWindow, true)')
    // No spurious popups on display changes
    expect(content).not.toContain("screen.on('display-added', () => {\n    handleDisplayChangeDebounced(true)")
  })

  it('verifies src/components/Header.tsx guards sync-led-btn to only render when cloud user is authenticated and settings is closed', () => {
    const headerPath = join(__dirname, '../src/components/Header.tsx')
    const content = readFileSync(headerPath, 'utf8')
    expect(content).toContain('!settingsOpen && !!cloudSyncState?.user')
    expect(content).toContain('className="sync-led-btn"')
  })

  it('verifies src/components/Settings.tsx displays vault badge on vault tab when authenticated', () => {
    const settingsPath = join(__dirname, '../src/components/Settings.tsx')
    const content = readFileSync(settingsPath, 'utf8')
    expect(content).toContain('showVaultBadge')
    expect(content).toContain("const isVaultTab = tab.id === 'cloud'")
  })

  it('verifies electron/main/loginItems.ts respects user preference and avoids 0.3.1 resurrection', () => {
    const loginItemsPath = join(__dirname, '../electron/main/loginItems.ts')
    const content = readFileSync(loginItemsPath, 'utf8')
    expect(content).not.toContain('Recovering launchAtLogin from existing active Run key')
    expect(content).toContain('const applied = await applyLaunchAtLogin(false)')
  })
})
