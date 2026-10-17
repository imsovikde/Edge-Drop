/**
 * Desktop Multi-Provider Authentication Engine for Edge-Drop.
 *
 * Responsibilities:
 *   - Google Sign-In via ephemeral 127.0.0.1 loopback listener + system browser flow.
 *   - GitHub OAuth / Token Sign-In.
 *   - Email / Password Registration & Sign-In.
 *   - Anonymous Guest Sign-In.
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

class AuthManager {
  private currentUser: FirebaseUserDto | null = null
  private listeners: Set<(user: FirebaseUserDto | null) => void> = new Set()
  private initialized = false

  public init(): void {
    if (this.initialized) return
    this.initialized = true

    const auth = getFirebaseAuth()
    if (!auth) return

    fbOnAuthStateChanged(auth, (user) => {
      this.currentUser = toUserDto(user)
      if (user) {
        this.persistSession(user)
      }
      this.notifyListeners()
    })

    this.restoreSession()
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
      const file = getAuthEncFile()
      const data = JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        savedAt: Date.now()
      })
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(data)
        writeFileSync(file, encrypted)
      } else {
        writeFileSync(file, data, 'utf8')
      }
    } catch (err) {
      console.warn('[AuthManager] persistSession failed:', err)
    }
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
      const parsed = JSON.parse(dataStr)
      if (parsed && parsed.uid) {
        console.log(`[AuthManager] Restored previous session for user ${parsed.email || parsed.uid}`)
      }
    } catch {
      /* ignore corrupted or obsolete session files */
    }
  }

  public async signInWithEmail(email: string, pass: string): Promise<FirebaseUserDto> {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase Auth is not initialized or configured')
    const cred = await signInWithEmailAndPassword(auth, email, pass)
    this.currentUser = toUserDto(cred.user)
    this.notifyListeners()
    return this.currentUser!
  }

  public async signUpWithEmail(email: string, pass: string): Promise<FirebaseUserDto> {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase Auth is not initialized or configured')
    const cred = await createUserWithEmailAndPassword(auth, email, pass)
    this.currentUser = toUserDto(cred.user)
    this.notifyListeners()
    return this.currentUser!
  }

  public async signInAnonymously(): Promise<FirebaseUserDto> {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase Auth is not initialized or configured')
    const cred = await fbSignInAnonymously(auth)
    this.currentUser = toUserDto(cred.user)
    this.notifyListeners()
    return this.currentUser!
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
          try { server.close() } catch { /* ignore */ }
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
              } catch { /* ignore */ }

              // Trigger immediate full sync pass
              try {
                const { syncEngine } = require('./syncEngine')
                syncEngine.triggerSync()
              } catch { /* ignore */ }

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
      this.notifyListeners()
      return this.currentUser!
    }

    throw new Error('Please provide a valid GitHub Personal Access Token or OAuth Token.')
  }

  public async signOut(): Promise<void> {
    const auth = getFirebaseAuth()
    if (auth) {
      await fbSignOut(auth)
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
