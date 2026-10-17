/**
 * Zero-Secret Firebase Configuration & Initialization Module.
 *
 * Responsibilities:
 *   - Resolves configuration from build-time VITE_FIREBASE_* environment variables.
 *   - Supports user-supplied custom Firebase JSON credentials (encrypted with safeStorage).
 *   - Local-first resilience: never blocks or crashes if unconfigured or offline.
 */
import { safeStorage } from 'electron'
import { initializeApp, getApps, getApp, deleteApp, FirebaseApp } from 'firebase/app'
import { getFirestore, Firestore } from 'firebase/firestore'
import { getAuth, Auth } from 'firebase/auth'
import { getStorage, FirebaseStorage } from 'firebase/storage'
import { CustomFirebaseConfig } from '../../shared/types'
import { getSettings } from '../store/settings'

export function getBuildTimeFirebaseConfig(): CustomFirebaseConfig | null {
  const apiKey = process.env.VITE_FIREBASE_API_KEY
  const authDomain = process.env.VITE_FIREBASE_AUTH_DOMAIN
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID
  const storageBucket = process.env.VITE_FIREBASE_STORAGE_BUCKET
  const messagingSenderId = process.env.VITE_FIREBASE_MESSAGING_SENDER_ID
  const appId = process.env.VITE_FIREBASE_APP_ID
  const measurementId = process.env.VITE_FIREBASE_MEASUREMENT_ID

  if (apiKey && projectId && appId) {
    return {
      apiKey,
      authDomain: authDomain || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: storageBucket || `${projectId}.firebasestorage.app`,
      messagingSenderId,
      appId,
      measurementId
    }
  }
  return null
}

export function parseAnyFirebaseConfigInput(rawInput: string): CustomFirebaseConfig | null {
  if (!rawInput || typeof rawInput !== 'string') return null
  const input = rawInput.trim()
  if (!input) return null

  // 1. If it contains curly braces (JSON or JS object snippet):
  const firstBrace = input.indexOf('{')
  const lastBrace = input.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const objectContent = input.slice(firstBrace, lastBrace + 1)
    try {
      const parsed = JSON.parse(objectContent)
      if (parsed.apiKey && parsed.projectId) {
        return {
          apiKey: String(parsed.apiKey).trim(),
          authDomain: parsed.authDomain ? String(parsed.authDomain).trim() : `${parsed.projectId}.firebaseapp.com`,
          projectId: String(parsed.projectId).trim(),
          storageBucket: parsed.storageBucket ? String(parsed.storageBucket).trim() : `${parsed.projectId}.firebasestorage.app`,
          messagingSenderId: parsed.messagingSenderId ? String(parsed.messagingSenderId).trim() : undefined,
          appId: parsed.appId ? String(parsed.appId).trim() : `${parsed.projectId}-web-app`,
          measurementId: parsed.measurementId ? String(parsed.measurementId).trim() : undefined
        }
      }
    } catch {
      // Loose JS object format (e.g. const firebaseConfig = { apiKey: "...", })
      const extractKey = (k: string): string | undefined => {
        const regex = new RegExp(`['"]?${k}['"]?\\s*[:=]\\s*['"\`]([^'"\`]+)['"\`]`, 'i')
        const m = objectContent.match(regex)
        return m ? m[1].trim() : undefined
      }

      const apiKey = extractKey('apiKey')
      const projectId = extractKey('projectId')
      if (apiKey && projectId) {
        return {
          apiKey,
          authDomain: extractKey('authDomain') || `${projectId}.firebaseapp.com`,
          projectId,
          storageBucket: extractKey('storageBucket') || `${projectId}.firebasestorage.app`,
          messagingSenderId: extractKey('messagingSenderId'),
          appId: extractKey('appId') || `${projectId}-web-app`,
          measurementId: extractKey('measurementId')
        }
      }
    }
  }

  // 2. Line-by-line / Key-Value / .env format:
  const lines = input.split(/\r?\n/)
  const map: Record<string, string> = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue
    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*[:=]\s*['"]?(.*?)['"]?;?$/)
    if (match) {
      const key = match[1].toLowerCase().replace(/^vite_/, '').replace(/^firebase_/, '')
      const val = match[2].trim().replace(/^['"]|['"]$/g, '')
      map[key] = val
    }
  }

  const apiKey = map['api_key'] || map['apikey']
  const projectId = map['project_id'] || map['projectid']
  if (apiKey && projectId) {
    const authDomain = map['auth_domain'] || map['authdomain'] || `${projectId}.firebaseapp.com`
    const storageBucket = map['storage_bucket'] || map['storagebucket'] || `${projectId}.firebasestorage.app`
    const messagingSenderId = map['messaging_sender_id'] || map['messagingsenderid']
    const appId = map['app_id'] || map['appid'] || `${projectId}-web-app`
    const measurementId = map['measurement_id'] || map['measurementid']
    return {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
      measurementId
    }
  }

  return null
}

export async function verifyFirebaseConnectivity(config: CustomFirebaseConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(config.apiKey)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        continueUri: `https://${config.authDomain || `${config.projectId}.firebaseapp.com`}`
      })
    })

    const data = (await res.json()) as any
    if (!res.ok) {
      if (data?.error?.message === 'API_KEY_INVALID' || data?.error?.message?.includes('API key not valid')) {
        return { ok: false, error: 'Firebase API key is invalid.' }
      }
      if (data?.error?.message?.includes('IP_REFERRER_BLOCKED')) {
        return { ok: false, error: 'API key has HTTP referer restrictions in Google Cloud Console.' }
      }
      if (data?.error?.message?.includes('BILLING_NOT_ENABLED')) {
        return { ok: false, error: 'Firebase project billing disabled or quota exceeded.' }
      }
      return { ok: false, error: data?.error?.message || `Preflight check failed with HTTP ${res.status}` }
    }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network connectivity check failed. Check your internet connection.' }
  }
}

export function getCustomFirebaseConfig(): CustomFirebaseConfig | null {
  const settings = getSettings()
  if (!settings.customFirebaseConfig) return null

  try {
    let jsonStr = settings.customFirebaseConfig
    if (safeStorage.isEncryptionAvailable()) {
      try {
        jsonStr = safeStorage.decryptString(Buffer.from(settings.customFirebaseConfig, 'base64'))
      } catch {
        // Plain text fallback if not base64 encrypted
      }
    }
    const parsed = JSON.parse(jsonStr)
    if (parsed && parsed.apiKey && parsed.projectId) {
      return parsed as CustomFirebaseConfig
    }
  } catch (err) {
    console.warn('[FirebaseConfig] Failed to parse customFirebaseConfig:', err)
  }
  return null
}

export function encryptCustomConfig(configJson: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(configJson).toString('base64')
  }
  return configJson
}

let _firebaseApp: FirebaseApp | null = null

export function getActiveFirebaseConfig(): CustomFirebaseConfig | null {
  return getCustomFirebaseConfig() || getBuildTimeFirebaseConfig()
}

export function getFirebaseApp(): FirebaseApp | null {
  if (_firebaseApp) return _firebaseApp

  const config = getActiveFirebaseConfig()
  if (!config) {
    return null
  }

  try {
    if (getApps().length > 0) {
      _firebaseApp = getApp()
    } else {
      _firebaseApp = initializeApp(config)
    }
    return _firebaseApp
  } catch (err) {
    console.error('[FirebaseConfig] initializeApp failed:', err)
    return null
  }
}

export async function reinitializeFirebase(overrideConfig?: CustomFirebaseConfig | null): Promise<FirebaseApp | null> {
  try {
    const apps = getApps()
    for (const a of apps) {
      await deleteApp(a).catch(() => {})
    }
  } catch {
    /* ignore */
  }
  _firebaseApp = null

  if (overrideConfig) {
    try {
      _firebaseApp = initializeApp(overrideConfig)
      return _firebaseApp
    } catch (err) {
      console.error('[FirebaseConfig] initializeApp failed with overrideConfig:', err)
      return null
    }
  }

  return getFirebaseApp()
}

export function getFirebaseAuth(): Auth | null {
  const fbApp = getFirebaseApp()
  if (!fbApp) return null
  try {
    return getAuth(fbApp)
  } catch (err) {
    console.error('[FirebaseConfig] getAuth failed:', err)
    return null
  }
}

export function getFirebaseFirestore(): Firestore | null {
  const fbApp = getFirebaseApp()
  if (!fbApp) return null
  try {
    return getFirestore(fbApp)
  } catch (err) {
    console.error('[FirebaseConfig] getFirestore failed:', err)
    return null
  }
}

export function getFirebaseStorage(): FirebaseStorage | null {
  const fbApp = getFirebaseApp()
  if (!fbApp) return null
  try {
    return getStorage(fbApp)
  } catch (err) {
    console.warn('[FirebaseConfig] getStorage failed (storage might not be provisioned):', err)
    return null
  }
}
