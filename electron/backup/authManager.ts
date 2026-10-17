/**
 * Desktop Multi-Provider Authentication Engine for Edge-Drop.
 *
 * Responsibilities:
 *   - Google Sign-In via ephemeral 127.0.0.1 loopback listener + system browser flow.
 *   - GitHub OAuth / Token Sign-In.
 *   - Email / Password Registration & Sign-In via Direct REST API with Firebase SDK fallback.
 *   - Anonymous Guest Sign-In via Direct REST API with Firebase SDK fallback.
 *   - Session token refresh via Google Token Service (https://securetoken.googleapis.com).
 *   - Credential persistence encrypted via Electron safeStorage (DPAPI).
 */
import { app, shell, safeStorage } from 'electron'
import { createServer, Server } from 'node:http'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously as fbSignInAnonymously,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithCredential,
  User
} from 'firebase/auth'
import { getFirebaseAuth, getActiveFirebaseConfig } from './firebaseConfig'
import { FirebaseUserDto } from '../../shared/types'

function getAuthEncFile(): string {
  try {
    return join(app.getPath('userData'), 'firebase-auth.enc')
  } catch {
    return join(process.cwd(), 'firebase-auth.enc')
  }
}

export function toUserDto(user: User | null): FirebaseUserDto | null {
  if (!user) return null
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    isAnonymous: user.isAnonymous,
    providerId: user.providerData?.[0]?.providerId || 'firebase'
  }
}

export function formatAuthError(errCodeOrMsg: string): string {
  const msg = String(errCodeOrMsg || '')
  if (msg.includes('EMAIL_NOT_FOUND')) return 'No account found with this email address.'
  if (msg.includes('INVALID_PASSWORD')) return 'Incorrect password. Please verify and try again.'
  if (msg.includes('INVALID_LOGIN_CREDENTIALS')) return 'Invalid email or password.'
  if (msg.includes('EMAIL_EXISTS')) return 'An account with this email address already exists.'
  if (msg.includes('OPERATION_NOT_ALLOWED')) return 'Email/Password sign-in is not enabled in Firebase Console.'
  if (msg.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) return 'Too many failed login attempts. Please try again later.'
  if (msg.includes('USER_DISABLED')) return 'This user account has been disabled.'
  if (msg.includes('WEAK_PASSWORD')) return 'Password should be at least 6 characters.'
  if (msg.includes('INVALID_EMAIL')) return 'Please provide a valid email address.'
  if (msg.includes('NETWORK_REQUEST_FAILED')) return 'Network connection failed. Check your internet connectivity.'
  return msg.replace(/^Firebase:\s*/, '').replace(/\s*\([a-z0-9/-]+\)\.?$/i, '')
}

interface PersistedAuthSession {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  isAnonymous: boolean
  providerId: string
  idToken?: string
  refreshToken?: string
  savedAt: number
}

class AuthManager {
  private currentUser: FirebaseUserDto | null = null
  private listeners: Set<(user: FirebaseUserDto | null) => void> = new Set()
  private initialized = false

  public init(): void {
    if (this.initialized) return
    this.initialized = true

    // Restore saved session from DPAPI-encrypted disk storage
    this.restoreSession()

    const auth = getFirebaseAuth()
    if (auth) {
      fbOnAuthStateChanged(auth, (user) => {
        if (user) {
          this.currentUser = toUserDto(user)
          this.persistSession(user)
          this.notifyListeners()
        }
      })
    }
  }

  public getCurrentUser(): FirebaseUserDto | null {
    return this.currentUser
  }

  public onAuthStateChanged(cb: (user: FirebaseUserDto | null) => void): () => void {
    this.listeners.add(cb)
    cb(this.currentUser)
    return () => this.listeners.delete(cb)
  }

  private notifyListeners(): void {
    for (const cb of this.listeners) {
      try {
        cb(this.currentUser)
      } catch (err) {
        console.error('[AuthManager] listener error:', err)
      }
    }
  }

  private persistSession(user: User): void {
    try {
      this.persistAuthTokens({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        isAnonymous: user.isAnonymous,
        providerId: user.providerData?.[0]?.providerId || 'firebase',
        savedAt: Date.now()
      })
    } catch (err) {
      console.warn('[AuthManager] persistSession failed:', err)
    }
  }

  private persistAuthTokens(session: PersistedAuthSession): void {
    try {
      const file = getAuthEncFile()
      const data = JSON.stringify(session)
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(data)
        writeFileSync(file, encrypted)
      } else {
        writeFileSync(file, data, 'utf8')
      }
    } catch (err) {
      console.warn('[AuthManager] persistAuthTokens failed:', err)
    }
  }

  private async refreshAuthToken(refreshToken: string): Promise<{ idToken: string; refreshToken: string } | null> {
    const config = getActiveFirebaseConfig()
    if (!config?.apiKey) return null

    try {
      const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }).toString()
      })

      if (!res.ok) return null
      const data = (await res.json()) as any
      if (data?.id_token && data?.refresh_token) {
        return {
          idToken: data.id_token,
          refreshToken: data.refresh_token
        }
      }
    } catch (err) {
      console.warn('[AuthManager] Token refresh failed:', err)
    }
    return null
  }

  private restoreSession(): void {
    try {
      const file = getAuthEncFile()
      if (!existsSync(file)) return
      const raw = readFileSync(file)
      let dataStr = ''
      if (safeStorage.isEncryptionAvailable()) {
        try {
          dataStr = safeStorage.decryptString(raw)
        } catch {
          dataStr = raw.toString('utf8')
        }
      } else {
        dataStr = raw.toString('utf8')
      }
      const parsed = JSON.parse(dataStr) as PersistedAuthSession
      if (parsed && parsed.uid) {
        this.currentUser = {
          uid: parsed.uid,
          email: parsed.email || null,
          displayName: parsed.displayName || null,
          photoURL: parsed.photoURL || null,
          isAnonymous: !!parsed.isAnonymous,
          providerId: parsed.providerId || 'firebase'
        }
        console.log(`[AuthManager] Restored previous session for user ${parsed.email || parsed.uid}`)
        this.notifyListeners()

        // Background refresh token
        if (parsed.refreshToken) {
          this.refreshAuthToken(parsed.refreshToken)
            .then((refreshed) => {
              if (refreshed) {
                this.persistAuthTokens({
                  ...parsed,
                  idToken: refreshed.idToken,
                  refreshToken: refreshed.refreshToken,
                  savedAt: Date.now()
                })
              }
            })
            .catch(() => {})
        }

        // Also sync SDK auth state if anonymous
        const auth = getFirebaseAuth()
        if (auth && !auth.currentUser && parsed.isAnonymous) {
          fbSignInAnonymously(auth).catch(() => {})
        }
      }
    } catch {
      /* ignore corrupted or obsolete session files */
    }
  }

  public async signInWithEmail(email: string, pass: string): Promise<FirebaseUserDto> {
    const config = getActiveFirebaseConfig()
    if (!config?.apiKey) throw new Error('Firebase configuration is missing or invalid')

    const cleanEmail = email.trim()
    const cleanPass = pass.trim()
    if (!cleanEmail || !cleanPass) throw new Error('Please enter both email and password.')

    // 1. Direct REST call to Identity Toolkit
    const restUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`
    const res = await fetch(restUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        password: cleanPass,
        returnSecureToken: true
      })
    })

    const data = (await res.json()) as any
    if (!res.ok) {
      const errMsg = data?.error?.message || `Sign in failed with status ${res.status}`
      throw new Error(formatAuthError(errMsg))
    }

    const userDto: FirebaseUserDto = {
      uid: data.localId,
      email: data.email || cleanEmail,
      displayName: data.displayName || null,
      photoURL: null,
      isAnonymous: false,
      providerId: 'password'
    }

    // 2. Also authenticate Firebase JS SDK if available so Firestore rules accept requests
    const auth = getFirebaseAuth()
    if (auth) {
      try {
        await signInWithEmailAndPassword(auth, cleanEmail, cleanPass)
      } catch (err) {
        console.warn('[AuthManager] Firebase SDK sign-in sync warning:', err)
      }
    }

    this.currentUser = userDto
    this.persistAuthTokens({
      uid: userDto.uid,
      email: userDto.email,
      displayName: userDto.displayName,
      photoURL: userDto.photoURL,
      isAnonymous: false,
      providerId: 'password',
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      savedAt: Date.now()
    })
    this.notifyListeners()
    return userDto
  }

  public async signUpWithEmail(email: string, pass: string): Promise<FirebaseUserDto> {
    const config = getActiveFirebaseConfig()
    if (!config?.apiKey) throw new Error('Firebase configuration is missing or invalid')

    const cleanEmail = email.trim()
    const cleanPass = pass.trim()
    if (!cleanEmail || !cleanPass) throw new Error('Please enter both email and password.')
    if (cleanPass.length < 6) throw new Error('Password must be at least 6 characters long.')

    // 1. Direct REST call to Identity Toolkit
    const restUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`
    const res = await fetch(restUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        password: cleanPass,
        returnSecureToken: true
      })
    })

    const data = (await res.json()) as any
    if (!res.ok) {
      const errMsg = data?.error?.message || `Registration failed with status ${res.status}`
      throw new Error(formatAuthError(errMsg))
    }

    const userDto: FirebaseUserDto = {
      uid: data.localId,
      email: data.email || cleanEmail,
      displayName: null,
      photoURL: null,
      isAnonymous: false,
      providerId: 'password'
    }

    // 2. Also register in Firebase JS SDK if available
    const auth = getFirebaseAuth()
    if (auth) {
      try {
        await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass)
      } catch (err) {
        console.warn('[AuthManager] Firebase SDK registration sync warning:', err)
      }
    }

    this.currentUser = userDto
    this.persistAuthTokens({
      uid: userDto.uid,
      email: userDto.email,
      displayName: userDto.displayName,
      photoURL: userDto.photoURL,
      isAnonymous: false,
      providerId: 'password',
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      savedAt: Date.now()
    })
    this.notifyListeners()
    return userDto
  }

  public async signInAnonymously(): Promise<FirebaseUserDto> {
    const config = getActiveFirebaseConfig()
    if (!config?.apiKey) throw new Error('Firebase configuration is missing or invalid')

    // 1. Direct REST call
    const restUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`
    const res = await fetch(restUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        returnSecureToken: true
      })
    })

    const data = (await res.json()) as any
    if (!res.ok) {
      const errMsg = data?.error?.message || `Guest sign-in failed with status ${res.status}`
      throw new Error(formatAuthError(errMsg))
    }

    const userDto: FirebaseUserDto = {
      uid: data.localId,
      email: null,
      displayName: 'Guest User',
      photoURL: null,
      isAnonymous: true,
      providerId: 'anonymous'
    }

    const auth = getFirebaseAuth()
    if (auth) {
      try {
        await fbSignInAnonymously(auth)
      } catch (err) {
        console.warn('[AuthManager] Firebase SDK anonymous sync warning:', err)
      }
    }

    this.currentUser = userDto
    this.persistAuthTokens({
      uid: userDto.uid,
      email: null,
      displayName: 'Guest User',
      photoURL: null,
      isAnonymous: true,
      providerId: 'anonymous',
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      savedAt: Date.now()
    })
    this.notifyListeners()
    return userDto
  }

  public async signInWithGoogle(): Promise<FirebaseUserDto> {
    const auth = getFirebaseAuth()
    const config = getActiveFirebaseConfig()
    if (!auth || !config) throw new Error('Firebase is not configured for Google Sign-In')

    return new Promise<FirebaseUserDto>((resolve, reject) => {
      let server: Server | null = null
      let timeoutId: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        if (server) {
          try {
            server.close()
          } catch {
            /* ignore */
          }
        }
      }

      server = createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
        if (url.pathname === '/callback') {
          const idToken = url.searchParams.get('id_token') || url.searchParams.get('access_token')
          const error = url.searchParams.get('error')

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end('<h3>Authentication Failed</h3><p>You can close this tab and return to Edge-Drop.</p>')
            cleanup()
            reject(new Error(`OAuth Error: ${error}`))
            return
          }

          if (idToken) {
            try {
              const credential = GoogleAuthProvider.credential(idToken)
              const userCred = await signInWithCredential(auth, credential)
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <title>Edge-Drop Authentication</title>
                    <style>
                      body { background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: grid; place-items: center; height: 100vh; margin: 0; }
                      .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 36px 44px; text-align: center; max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
                      .badge { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: #10b981; margin-bottom: 20px; font-size: 26px; }
                      h2 { margin: 0 0 10px; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
                      p { margin: 0; color: #a1a1aa; font-size: 14px; line-height: 1.5; }
                    </style>
                  </head>
                  <body>
                    <div class="card">
                      <div class="badge">✓</div>
                      <h2>Connected to Edge-Drop</h2>
                      <p>Authentication complete. Returning to your active session...</p>
                    </div>
                    <script>
                      try { window.close(); } catch(e) {}
                      setTimeout(() => { try { window.close(); } catch(e) {} }, 800);
                    </script>
                  </body>
                </html>
              `)
              cleanup()
              this.currentUser = toUserDto(userCred.user)
              this.persistSession(userCred.user)
              this.notifyListeners()

              // Refocus Edge-Drop active window
              try {
                const { getMainWindow } = require('../main/window')
                const win = getMainWindow()
                if (win && !win.isDestroyed()) {
                  app.focus({ steal: true })
                  win.show()
                  win.focus()
                }
              } catch {
                /* ignore */
              }

              // Trigger immediate full sync pass
              try {
                const { syncEngine } = require('./syncEngine')
                syncEngine.triggerSync()
              } catch {
                /* ignore */
              }

              resolve(this.currentUser!)
              return
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <title>Authentication Error</title>
                    <style>
                      body { background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: grid; place-items: center; height: 100vh; margin: 0; }
                      .card { background: #18181b; border: 1px solid #ef4444; border-radius: 16px; padding: 36px 44px; text-align: center; max-width: 400px; }
                      h2 { margin: 0 0 10px; font-size: 18px; color: #ef4444; }
                      p { margin: 0; color: #a1a1aa; font-size: 14px; }
                    </style>
                  </head>
                  <body>
                    <div class="card">
                      <h2>Authentication Error</h2>
                      <p>Unable to complete sign-in. You can close this tab and try again in Edge-Drop.</p>
                    </div>
                  </body>
                </html>
              `)
              cleanup()
              reject(err)
              return
            }
          }

          // If loopback received fragment via hash, send a small JS redirect to convert hash to query
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><meta charset="utf-8"><title>Connecting...</title></head>
              <body style="background:#09090b;color:#a1a1aa;font-family:sans-serif;display:grid;place-items:center;height:100vh;">
                <script>
                  if (window.location.hash) {
                    window.location.href = '/callback?' + window.location.hash.substring(1);
                  } else {
                    document.body.innerHTML = '<h3>Connecting to Edge-Drop...</h3>';
                  }
                </script>
              </body>
            </html>
          `)
        }
      })

      server.listen(0, '127.0.0.1', () => {
        const addr = server?.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        if (!port) {
          cleanup()
          reject(new Error('Failed to bind ephemeral loopback listener'))
          return
        }

        const redirectUri = `http://127.0.0.1:${port}/callback`
        const authUrl = `https://${config.authDomain}/__/auth/handler?apiKey=${encodeURIComponent(config.apiKey)}&appName=${encodeURIComponent(config.projectId)}&authType=signInWithPopup&providerId=google.com&redirectUrl=${encodeURIComponent(redirectUri)}`

        shell.openExternal(authUrl).catch((err) => {
          cleanup()
          reject(err)
        })

        // 3 minute timeout
        timeoutId = setTimeout(() => {
          cleanup()
          reject(new Error('Google Sign-In timed out. Please try again.'))
        }, 180000)
      })
    })
  }

  public async signInWithGithub(token?: string): Promise<FirebaseUserDto> {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase Auth is not initialized or configured')

    if (token) {
      const credential = GithubAuthProvider.credential(token)
      const userCred = await signInWithCredential(auth, credential)
      this.currentUser = toUserDto(userCred.user)
      this.persistSession(userCred.user)
      this.notifyListeners()
      return this.currentUser!
    }

    throw new Error('Please provide a valid GitHub Personal Access Token or OAuth Token.')
  }

  public async signOut(): Promise<void> {
    const auth = getFirebaseAuth()
    if (auth) {
      try {
        await fbSignOut(auth)
      } catch {
        /* ignore */
      }
    }
    this.currentUser = null
    try {
      const file = getAuthEncFile()
      if (existsSync(file)) rmSync(file)
    } catch {
      /* ignore */
    }
    this.notifyListeners()
  }
}

export const authManager = new AuthManager()

