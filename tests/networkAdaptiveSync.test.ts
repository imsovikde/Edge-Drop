import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { adaptiveGovernor } from '../electron/backup/adaptiveGovernor'
import { syncEngine } from '../electron/backup/syncEngine'

describe('Epoch 17: Network-Adaptive Sync Engine, Concurrency Worker Pool & Instant Installer Detachment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('verifies resources/installer.nsh invokes explorer.exe for detached, non-blocking execution', () => {
    const nshPath = join(__dirname, '../resources/installer.nsh')
    const content = readFileSync(nshPath, 'utf8')
    expect(content).toContain('Exec \'"$WINDIR\\explorer.exe" "$appExe"\'')
    expect(content).toContain('Function StartAppFast')
    expect(content).not.toContain('ExecShell "open" "$appExe"')
  })

  it('verifies electron/main/index.ts elevates OS priority to PRIORITY_ABOVE_NORMAL during cold boot', () => {
    const indexPath = join(__dirname, '../electron/main/index.ts')
    const content = readFileSync(indexPath, 'utf8')
    expect(content).toContain('os.constants.priority.PRIORITY_ABOVE_NORMAL')
    expect(content).toContain('os.constants.priority.PRIORITY_NORMAL')
    expect(content).toContain('os.constants.priority.PRIORITY_BELOW_NORMAL')
  })

  it('verifies adaptiveGovernor supports dynamic network quality classification and adaptive delay', () => {
    adaptiveGovernor.setNetworkQuality('optimal')
    expect(adaptiveGovernor.getNetworkQuality()).toBe('optimal')

    adaptiveGovernor.setNetworkQuality('constrained')
    expect(adaptiveGovernor.getNetworkQuality()).toBe('constrained')

    adaptiveGovernor.setNetworkQuality('moderate')
    expect(adaptiveGovernor.getNetworkQuality()).toBe('moderate')
  })

  it('verifies syncEngine state exposes network quality and sync progress contracts', () => {
    const state = syncEngine.getState()
    expect(state).toHaveProperty('networkQuality')
    expect(['optimal', 'moderate', 'constrained']).toContain(state.networkQuality)
    expect(state).toHaveProperty('progress')
  })

  it('verifies CloudVaultSettings renders network quality indicator and progress status', () => {
    const settingsPath = join(__dirname, '../src/components/CloudVaultSettings.tsx')
    const content = readFileSync(settingsPath, 'utf8')
    expect(content).toContain('cloudSyncState?.networkQuality')
    expect(content).toContain('cloudSyncState?.progress')
    expect(content).toContain('cloudSyncState.progress.stage')
  })
})
