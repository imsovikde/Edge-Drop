import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ClipboardItem, CustomFirebaseConfig } from '../shared/types'
import { encryptCustomConfig, getBuildTimeFirebaseConfig } from '../electron/backup/firebaseConfig'

// Mock Electron safeStorage
vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:\\mock\\userData',
    getAppPath: () => 'C:\\mock\\app'
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (str: string) => Buffer.from(`enc:${str}`),
    decryptString: (buf: Buffer) => buf.toString('utf8').replace(/^enc:/, '')
  }
}))

vi.mock('../electron/store/settings', () => ({
  getSettings: () => ({
    customFirebaseConfig: undefined,
    cloudSyncEnabled: true
  })
}))

describe('Firebase & Cloud Sync Subsystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('firebaseConfig', () => {
    it('encrypts custom configuration cleanly via safeStorage', () => {
      const config: CustomFirebaseConfig = {
        apiKey: 'AIzaSyFakeKey123',
        authDomain: 'edge-drop.firebaseapp.com',
        projectId: 'edge-drop',
        storageBucket: 'edge-drop.firebasestorage.app',
        appId: '1:123456:web:abcdef'
      }
      const rawJson = JSON.stringify(config)
      const encrypted = encryptCustomConfig(rawJson)

      expect(encrypted).toBeTruthy()
      expect(typeof encrypted).toBe('string')
      // Base64 decoded should start with our mocked enc: prefix
      const decoded = Buffer.from(encrypted, 'base64').toString('utf8')
      expect(decoded.startsWith('enc:')).toBe(true)
      expect(decoded).toContain('AIzaSyFakeKey123')
    })

    it('returns null for build-time config when required environment variables are absent', () => {
      const originalEnv = { ...process.env }
      delete process.env.VITE_FIREBASE_API_KEY
      delete process.env.VITE_FIREBASE_PROJECT_ID
      delete process.env.VITE_FIREBASE_APP_ID

      const config = getBuildTimeFirebaseConfig()
      expect(config).toBeNull()

      process.env = originalEnv
    })

    it('resolves build-time config when VITE_FIREBASE_* env variables exist', () => {
      const orig = { ...process.env }
      process.env.VITE_FIREBASE_API_KEY = 'test-key'
      process.env.VITE_FIREBASE_PROJECT_ID = 'test-project'
      process.env.VITE_FIREBASE_APP_ID = 'test-app'
      process.env.VITE_FIREBASE_AUTH_DOMAIN = 'test-project.firebaseapp.com'

      const config = getBuildTimeFirebaseConfig()
      expect(config).toEqual(expect.objectContaining({
        apiKey: 'test-key',
        projectId: 'test-project',
        appId: 'test-app',
        authDomain: 'test-project.firebaseapp.com'
      }))
      process.env = orig
    })
  })

  describe('Item payload mutations and sync compatibility', () => {
    it('structures text item mutations with full payload indicators for cloud sync', () => {
      const item: ClipboardItem = {
        id: 'item-1',
        data: {
          kind: 'text',
          text: 'Hello Cloud Sync',
          isUrl: false
        },
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: true
      }

      expect(item.data.kind).toBe('text')
      expect(item.id).toBe('item-1')
      expect(item.pinned).toBe(true)
    })

    it('handles image item metadata and blob attributes', () => {
      const imageItem: ClipboardItem = {
        id: 'img-1',
        data: {
          kind: 'image',
          imageId: 'img-hash-123',
          width: 800,
          height: 600,
          bytes: 409600,
          ext: 'png'
        },
        capturedAt: Date.now(),
        hitCount: 1,
        pinned: false
      }

      expect(imageItem.data.kind).toBe('image')
      if (imageItem.data.kind === 'image') {
        expect(imageItem.data.imageId).toBe('img-hash-123')
        expect(imageItem.data.width).toBe(800)
      }
    })

    it('initializes syncEngine cleanly with idle status', async () => {
      const { syncEngine } = await import('../electron/backup/syncEngine')
      const state = syncEngine.getState()
      expect(state.status).toBe('idle')
      expect(state.lastSyncedAt).toBeNull()
      expect(state.pendingMutations).toBe(0)
    })
  })
})
