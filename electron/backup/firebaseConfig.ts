/**
 * Zero-Secret Firebase Configuration & Initialization Module.
 *
 * Responsibilities:
 *   - Resolves configuration from build-time VITE_FIREBASE_* environment variables.
 *   - Supports user-supplied custom Firebase JSON credentials (encrypted with safeStorage).
 *   - Local-first resilience: never blocks or crashes if unconfigured or offline.
 */
import { safeStorage } from 'electron'
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app'
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
    if (parsed && parsed.apiKey && parsed.projectId && parsed.appId) {
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
