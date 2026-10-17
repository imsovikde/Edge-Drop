/**
 * Adaptive Intelligence Sync Governor for Edge-Drop.
 *
 * Responsibilities:
 *   - Event-driven delta coalescing with 300ms sliding window to prevent network/disk thrashing.
 *   - In-memory dirty-bit Merkle map to track unsynced items, blobs, and settings.
 *   - Hardware and power awareness via Electron powerMonitor (throttles on battery, bursts on AC).
 *   - Persistent Write-Ahead Log (WAL) in sync-wal.json for crash-proof durability.
 */
import { app, powerMonitor } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { atomicWriteFileSync, computeSha256 } from './cryptoIntegrity'
import type { ClipboardItem, Settings } from '../../shared/types'

export interface WalEntry {
  id: string
  action: 'upsert' | 'delete' | 'settings'
  item?: ClipboardItem
  settings?: Partial<Settings>
  timestamp: number
  retryCount: number
}

function getWalPath(): string {
  try {
    return join(app.getPath('userData'), 'sync-wal.json')
  } catch {
    return join(process.cwd(), 'sync-wal.json')
  }
}

class AdaptiveGovernor {
  private dirtyItems: Map<string, WalEntry> = new Map()
  private settingsDirty: WalEntry | null = null
  private coalesceTimer: NodeJS.Timeout | null = null
  private isOnBattery = false
  private isSuspended = false
  private syncCallback: ((entries: WalEntry[]) => Promise<void>) | null = null
  private isFlushing = false

  public init(syncCb: (entries: WalEntry[]) => Promise<void>): void {
    this.syncCallback = syncCb
    this.loadWal()
    this.initPowerMonitor()
  }

  private initPowerMonitor(): void {
    try {
      this.isOnBattery = powerMonitor.isOnBatteryPower()

      powerMonitor.on('on-battery', () => {
        this.isOnBattery = true
      })

      powerMonitor.on('on-ac', () => {
        this.isOnBattery = false
        // Immediately flush queue on AC power restoration
        this.flushNow()
      })

      powerMonitor.on('suspend', () => {
        this.isSuspended = true
        if (this.coalesceTimer) {
          clearTimeout(this.coalesceTimer)
          this.coalesceTimer = null
        }
      })

      powerMonitor.on('resume', () => {
        this.isSuspended = false
        // Give network 2 seconds to establish on resume, then flush
        setTimeout(() => this.flushNow(), 2000)
      })

      powerMonitor.on('unlock-screen', () => {
        this.flushNow()
      })
    } catch (err) {
      console.warn('[AdaptiveGovernor] powerMonitor initialization skipped:', err)
    }
  }

  private loadWal(): void {
    try {
      const file = getWalPath()
      if (existsSync(file)) {
        const raw = readFileSync(file, 'utf8')
        const entries: WalEntry[] = JSON.parse(raw)
        for (const entry of entries) {
          if (entry.action === 'settings') {
            this.settingsDirty = entry
          } else {
            this.dirtyItems.set(entry.id, entry)
          }
        }
      }
    } catch {
      this.dirtyItems.clear()
      this.settingsDirty = null
    }
  }

  private persistWal(): void {
    try {
      const all: WalEntry[] = Array.from(this.dirtyItems.values())
      if (this.settingsDirty) {
        all.push(this.settingsDirty)
      }
      atomicWriteFileSync(getWalPath(), JSON.stringify(all))
    } catch (err) {
      console.warn('[AdaptiveGovernor] persistWal failed:', err)
    }
  }

  /**
   * Queue an item mutation with 300ms sliding-window coalescing.
   */
  public queueItem(item: ClipboardItem, action: 'upsert' | 'delete'): void {
    const existing = this.dirtyItems.get(item.id)
    const entry: WalEntry = {
      id: item.id,
      action,
      item,
      timestamp: Date.now(),
      retryCount: existing ? existing.retryCount : 0
    }
    this.dirtyItems.set(item.id, entry)
    this.persistWal()
    this.scheduleCoalescedFlush()
  }

  /**
   * Queue a settings mutation.
   */
  public queueSettings(settingsPatch: Partial<Settings>): void {
    this.settingsDirty = {
      id: 'settings',
      action: 'settings',
      settings: settingsPatch,
      timestamp: Date.now(),
      retryCount: this.settingsDirty ? this.settingsDirty.retryCount : 0
    }
    this.persistWal()
    this.scheduleCoalescedFlush()
  }

  private scheduleCoalescedFlush(): void {
    if (this.isSuspended) return

    // 300ms window on AC power, 1200ms on battery power to conserve energy
    const windowMs = this.isOnBattery ? 1200 : 300

    if (this.coalesceTimer) clearTimeout(this.coalesceTimer)
    this.coalesceTimer = setTimeout(() => {
      this.coalesceTimer = null
      this.flushNow()
    }, windowMs)
  }

  /**
   * Immediately flush all dirty entries to the sync callback.
   */
  public async flushNow(): Promise<void> {
    if (this.isFlushing || this.isSuspended || !this.syncCallback) return

    const entriesToFlush: WalEntry[] = Array.from(this.dirtyItems.values())
    if (this.settingsDirty) {
      entriesToFlush.push(this.settingsDirty)
    }

    if (entriesToFlush.length === 0) return

    this.isFlushing = true
    try {
      await this.syncCallback(entriesToFlush)

      // Upon success, clear processed entries
      for (const e of entriesToFlush) {
        if (e.action === 'settings') {
          if (this.settingsDirty === e) this.settingsDirty = null
        } else {
          if (this.dirtyItems.get(e.id) === e) {
            this.dirtyItems.delete(e.id)
          }
        }
      }
      this.persistWal()
    } catch (err) {
      // Increment retry count for exponential backoff
      for (const e of entriesToFlush) {
        e.retryCount++
      }
      this.persistWal()
      throw err
    } finally {
      this.isFlushing = false
    }
  }

  public getPendingCount(): number {
    return this.dirtyItems.size + (this.settingsDirty ? 1 : 0)
  }

  /**
   * Returns a deterministic 16-character hash of current dirty state for quick Merkle diffing.
   */
  public getMerkleDigest(): string {
    const keys = Array.from(this.dirtyItems.keys()).sort().join(':')
    const hasSettings = this.settingsDirty ? 'settings:dirty' : 'settings:clean'
    return computeSha256(`${keys}|${hasSettings}`).slice(0, 16)
  }
}

export const adaptiveGovernor = new AdaptiveGovernor()
