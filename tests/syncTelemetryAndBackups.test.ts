import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ItemStore } from '../electron/store/ItemStore'
import { PATHS } from '../electron/store/paths'
import { localVault } from '../electron/backup/localVault'
import { testFirebaseConnectivity } from '../electron/backup/firebaseConfig'
import { syncEngine } from '../electron/backup/syncEngine'
import * as stateModule from '../electron/main/state'
import type { ClipboardItem } from '../shared/types'

describe('Epoch 3: Real-Time Sync Telemetry, BYO Connectivity Test & Rolling Backups', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ed-epoch3-'))
    vi.spyOn(PATHS, 'root').mockReturnValue(tempDir)
    vi.spyOn(PATHS, 'indexFile').mockReturnValue(join(tempDir, 'items.json'))
    vi.spyOn(PATHS, 'imagesDir').mockReturnValue(join(tempDir, 'images'))
    vi.spyOn(PATHS, 'payloadsDir').mockReturnValue(join(tempDir, 'payloads'))
    vi.spyOn(PATHS, 'backupsDir').mockReturnValue(join(tempDir, 'backups'))
    vi.spyOn(PATHS, 'imageFile').mockImplementation((id: string) => join(tempDir, 'images', `${id}.png`))

    vi.spyOn(stateModule, 'loadSettings').mockReturnValue({ hotZoneHeight: 0.4 } as any)
    vi.spyOn(stateModule, 'saveSettings').mockImplementation(() => {})
    vi.spyOn(stateModule, 'pushState', 'get').mockReturnValue({
      items: vi.fn(),
      settings: vi.fn(),
      activeFilter: vi.fn()
    } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('creates rolling backup in backupsDir and returns valid RollingBackupMetadata', async () => {
    const store = new ItemStore()
    vi.spyOn(stateModule, 'getStore').mockReturnValue(store)

    store.add({ kind: 'text', text: 'Hello backup test 1', isUrl: false }, 50)
    store.add({ kind: 'text', text: 'Hello backup test 2', isUrl: false }, 50)

    const meta = await localVault.createRollingBackup()

    expect(meta.itemCount).toBe(2)
    expect(meta.filename).toMatch(/^backup-\d+-2items\.edvault$/)
    expect(meta.byteSize).toBeGreaterThan(0)
    expect(existsSync(join(tempDir, 'backups', meta.filename))).toBe(true)

    const list = await localVault.listRollingBackups()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(meta.filename)
    expect(list[0].itemCount).toBe(2)
  })

  it('prunes rolling backups strictly to 5, deleting older snapshots', async () => {
    const store = new ItemStore()
    vi.spyOn(stateModule, 'getStore').mockReturnValue(store)
    store.add({ kind: 'text', text: 'Rolling prune item', isUrl: false }, 50)

    // Generate 7 consecutive rolling backups with sequential timestamps
    for (let i = 0; i < 7; i++) {
      vi.spyOn(Date, 'now').mockReturnValue(1700000000000 + i * 1000)
      await localVault.createRollingBackup()
    }

    const backupsOnDisk = readdirSync(join(tempDir, 'backups')).filter((f) => f.endsWith('.edvault'))
    expect(backupsOnDisk.length).toBe(5)

    const list = await localVault.listRollingBackups()
    expect(list.length).toBe(5)
    // Ordered newest first
    expect(list[0].timestamp).toBeGreaterThan(list[4].timestamp)
  })

  it('restores state accurately from a selected rolling backup', async () => {
    const store = new ItemStore()
    vi.spyOn(stateModule, 'getStore').mockReturnValue(store)

    store.add({ kind: 'text', text: 'Original note prior to wipe', isUrl: false }, 50)
    const backup = await localVault.createRollingBackup()

    // Simulate clearing store
    const itemToWipe = store.list()[0]
    store.delete(itemToWipe.id)
    expect(store.list().length).toBe(0)

    // Restore from rolling backup
    const result = await localVault.restoreRollingBackup(backup.id)
    expect(result.success).toBe(true)
    expect(result.restoredItems).toBe(1)

    const restoredList = store.list()
    expect(restoredList.length).toBe(1)
    expect(restoredList[0].data.kind === 'text' && restoredList[0].data.text).toBe('Original note prior to wipe')
  })

  it('testFirebaseConnectivity returns graceful failure with error when unconfigured', async () => {
    const result = await testFirebaseConnectivity(null)
    expect(result.ok).toBe(false)
    expect(result.latencyMs).toBe(0)
    expect(result.error).toContain('No active Firebase configuration found')
  })

  it('testFirebaseConnectivity measures latency and returns structured reachability result', async () => {
    const fakeFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('createAuthUri')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ allProviders: [] })
        })
      }
      if (url.includes('firestore.googleapis.com')) {
        return Promise.resolve({
          ok: false,
          status: 403, // PERMISSION_DENIED proves Firestore API is reached
          json: async () => ({ error: { status: 'PERMISSION_DENIED' } })
        })
      }
      return Promise.reject(new Error('Unknown url'))
    })

    vi.stubGlobal('fetch', fakeFetch)

    const result = await testFirebaseConnectivity({
      apiKey: 'test-api-key',
      authDomain: 'test-project.firebaseapp.com',
      projectId: 'test-project',
      storageBucket: 'test-project.firebasestorage.app',
      appId: '1:123:web:456'
    })

    expect(result.ok).toBe(true)
    expect(result.authOk).toBe(true)
    expect(result.firestoreOk).toBe(true)
    expect(result.projectId).toBe('test-project')
    expect(typeof result.latencyMs).toBe('number')
  })

  it('syncEngine.getState exposes real-time latencyMs and cloudItemCount', () => {
    const state = syncEngine.getState()
    expect(state).toHaveProperty('status')
    expect(state).toHaveProperty('pendingMutations')
    expect(state).toHaveProperty('cloudItemCount')
    expect(typeof state.cloudItemCount).toBe('number')
  })
})
