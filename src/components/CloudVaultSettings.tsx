import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import { edge } from '../lib/edge'
import { playButtonClickSound, playToggleSound } from '../lib/soundEffects'

export function CloudVaultSettings({ isHorizontal }: { isHorizontal?: boolean }) {
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)
  const firebaseUser = useStore((s) => s.firebaseUser)
  const cloudSyncState = useStore((s) => s.cloudSyncState)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authSuccess, setAuthSuccess] = useState<string | null>(null)
  const [showConfigInput, setShowConfigInput] = useState(false)
  const [customConfigInput, setCustomConfigInput] = useState('')
  const [configFeedback, setConfigFeedback] = useState<string | null>(null)
  const [vaultMsg, setVaultMsg] = useState<string | null>(null)
  const [rulesCopied, setRulesCopied] = useState(false)
  const [isSendingVerification, setIsSendingVerification] = useState(false)

  const handleSendVerificationEmail = async () => {
    playButtonClickSound()
    setIsSendingVerification(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      const res = await edge.sendVerificationEmail()
      if (res.ok) {
        setAuthSuccess(res.message)
      } else {
        setAuthError(res.message)
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to send verification email')
    } finally {
      setIsSendingVerification(false)
    }
  }

  // ── Keyboard Focus Engagement (WS_EX_NOACTIVATE Window Unlock) ─────────
  const inputEngagedRef = useRef(false)

  const engageFocus = useCallback(() => {
    if (inputEngagedRef.current) return
    inputEngagedRef.current = true
    try {
      window.focus()
    } catch {
      /* ignore */
    }
    try {
      const p = edge.focusWindow(true) as unknown as Promise<void> | undefined
      if (p && typeof (p as Promise<void>).then === 'function') {
        ;(p as Promise<void>).catch(() => {})
      }
    } catch {
      /* ignore */
    }
    try {
      void edge.pauseHotkey(true)?.catch?.(() => {})
    } catch {
      /* ignore */
    }
  }, [])

  const disengageFocus = useCallback(() => {
    if (!inputEngagedRef.current) return
    inputEngagedRef.current = false
    try {
      void edge.focusWindow(false)?.catch?.(() => {})
    } catch {
      /* ignore */
    }
    try {
      void edge.pauseHotkey(false)?.catch?.(() => {})
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => () => {
    disengageFocus()
  }, [disengageFocus])

  // ── Auth Handlers ───────────────────────────────────────────────────────
  const handleAnonymousSignIn = async () => {
    playButtonClickSound()
    setIsSubmitting(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      await edge.signInAnonymous()
      setAuthSuccess('Signed in as Guest with cloud backup active!')
    } catch (err: any) {
      setAuthError(err?.message || 'Guest sign-in failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEmailAuth = async (isRegister: boolean) => {
    if (!email.trim() || !password.trim()) {
      setAuthError('Please enter both email and password.')
      return
    }
    playButtonClickSound()
    setIsSubmitting(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      if (isRegister) {
        await edge.signUpEmail(email.trim(), password.trim())
        setAuthSuccess('Account created and signed in successfully!')
      } else {
        await edge.signInEmail(email.trim(), password.trim())
        setAuthSuccess('Signed in successfully!')
      }
      setEmail('')
      setPassword('')
    } catch (err: any) {
      setAuthError(err?.message || (isRegister ? 'Registration failed' : 'Sign-in failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    playButtonClickSound()
    setIsSubmitting(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      await edge.signOut()
      setAuthSuccess('Signed out. Local clipboard items preserved.')
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to sign out')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForceSync = async () => {
    playButtonClickSound()
    setIsSubmitting(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      await edge.forceSync()
      setAuthSuccess('Force sync complete: local and cloud vaults reconciled.')
    } catch (err: any) {
      setAuthError(err?.message || 'Force sync failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTriggerSync = async () => {
    playButtonClickSound()
    try {
      await edge.triggerSync()
    } catch (err: any) {
      setAuthError(err?.message || 'Sync failed to trigger')
    }
  }

  const handleExportVault = async () => {
    playButtonClickSound()
    setIsSubmitting(true)
    setVaultMsg(null)
    setAuthError(null)
    try {
      const res = await edge.exportVault()
      if (res.success) {
        setVaultMsg(`Exported ${res.itemCount} items (${res.imageCount} images) to ${res.path}`)
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Export failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleImportVault = async () => {
    playButtonClickSound()
    setIsSubmitting(true)
    setVaultMsg(null)
    setAuthError(null)
    try {
      const res = await edge.importVault()
      if (res.success) {
        setVaultMsg(`Restored ${res.restoredItems} items (${res.restoredImages} images) successfully.`)
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Import failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Custom Database Configuration ──────────────────────────────────────
  const handleVerifyAndConnect = async () => {
    if (!customConfigInput.trim()) return
    playButtonClickSound()
    setIsSubmitting(true)
    setConfigFeedback(null)
    setAuthError(null)
    try {
      const res = await edge.verifyAndConnectFirebase(customConfigInput.trim())
      if (res.success && res.config) {
        setConfigFeedback(`Connected to Firebase project "${res.config.projectId}"! DPAPI encrypted at rest.`)
        setShowConfigInput(false)
        setCustomConfigInput('')
      } else {
        setAuthError(res.error || 'Failed to verify custom Firebase configuration.')
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to verify custom configuration')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetCustomConfig = async () => {
    playButtonClickSound()
    setIsSubmitting(true)
    setAuthError(null)
    try {
      await edge.resetCustomFirebaseConfig()
      setConfigFeedback('Reset to default Edge-Drop cloud backend.')
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to reset custom config')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopySetupRules = () => {
    playButtonClickSound()
    const rulesText = [
      '// Edge-Drop Firestore Security Rules',
      "rules_version = '2';",
      'service cloud.firestore {',
      '  match /databases/{database}/documents {',
      '    match /users/{userId}/{document=**} {',
      '      allow read, write: if request.auth != null && request.auth.uid == userId;',
      '    }',
      '  }',
      '}',
      '',
      '// Edge-Drop Firebase Storage Security Rules',
      "rules_version = '2';",
      'service firebase.storage {',
      '  match /b/{bucket}/o {',
      '    match /users/{userId}/{allPaths=**} {',
      '      allow read, write: if request.auth != null && request.auth.uid == userId;',
      '    }',
      '  }',
      '}'
    ].join('\n')

    navigator.clipboard.writeText(rulesText).then(() => {
      setRulesCopied(true)
      setTimeout(() => setRulesCopied(false), 2500)
    }).catch(() => {})
  }

  // Status Beacon Calculation
  const isSyncing = cloudSyncState?.status === 'syncing' || isSubmitting
  const isError = cloudSyncState?.status === 'error' || !!authError
  const isConnected = !!firebaseUser

  const statusBeaconColor = isSyncing
    ? '#ffb300'
    : isError
      ? '#f44336'
      : isConnected
        ? '#10b981'
        : '#3b82f6'

  const statusText = isSyncing
    ? 'Syncing in progress...'
    : isError
      ? 'Sync error or offline'
      : isConnected
        ? firebaseUser.isAnonymous
          ? 'Guest Vault Active'
          : `Linked: ${firebaseUser.email || firebaseUser.displayName || firebaseUser.uid.slice(0, 10)}`
        : 'Local Storage Only (Unlinked)'

  return (
    <div className={isHorizontal ? 'shelf-card-col' : undefined}>
      {/* ── Section Divider ── */}
      <div className={isHorizontal ? 'shelf-section-divider' : 'setting-section-divider'}>
        <span className={isHorizontal ? 'shelf-section-divider-text' : 'setting-section-divider-text'}>
          CLOUD VAULT & MULTI-DEVICE SYNC
        </span>
      </div>

      {/* Global Notice Banners */}
      {authError && (
        <div className="vault-error-banner" style={{ margin: '0 0 10px 0' }}>
          <div>{authError}</div>
          <a
            href="https://github.com/imsovikde/Edge-Drop/issues/new?title=Cloud%20Vault%20Issue"
            target="_blank"
            rel="noreferrer"
            style={{ color: '#ff8a80', fontSize: '11px', textDecoration: 'underline' }}
          >
            Report Issue on GitHub ↗
          </a>
        </div>
      )}

      {authSuccess && (
        <div className="vault-success-banner" style={{ margin: '0 0 10px 0' }}>
          ✓ {authSuccess}
        </div>
      )}

      {configFeedback && (
        <div className="vault-success-banner" style={{ margin: '0 0 10px 0' }}>
          ✓ {configFeedback}
        </div>
      )}

      {/* Card 1: Cloud Sync Status Beacon */}
      <div className="vault-card">
        <div className="vault-card-header">
          <div className="vault-card-label">STATUS & VAULT BEACON</div>
          <div className="vault-beacon-wrap">
            <span
              className="vault-beacon"
              style={{
                background: statusBeaconColor,
                boxShadow: `0 0 8px ${statusBeaconColor}88`
              }}
            />
            <div className="vault-card-title">{statusText}</div>
          </div>
          <div className="vault-card-desc">
            {isConnected
              ? 'Your clipboard history, high-res images, and stacks are automatically backed up and synced in real-time.'
              : 'Sign in to automatically sync your clipboard history and images across your desktop devices.'}
          </div>
          {cloudSyncState?.pendingMutations ? (
            <div style={{ fontSize: '11px', color: '#ffb300', marginTop: '4px' }}>
              {cloudSyncState.pendingMutations} pending item(s) in offline write-ahead log
            </div>
          ) : null}
        </div>

        {isConnected && (
          <div className="vault-grid-2">
            <button
              type="button"
              className="vault-btn-secondary"
              onClick={handleTriggerSync}
              disabled={isSyncing}
            >
              Sync Now
            </button>
            <button
              type="button"
              className="vault-btn-primary"
              onClick={handleForceSync}
              disabled={isSubmitting}
            >
              Force Sync
            </button>
          </div>
        )}
      </div>

      {/* Card 2: Authentication Controls */}
      <div className="vault-card">
        <div className="vault-card-header">
          <div className="vault-card-label">ACCOUNT ACCESS</div>
        </div>

        {isConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <div className="vault-card-title">
                {firebaseUser.isAnonymous ? 'Guest Account' : firebaseUser.email || 'Connected Account'}
              </div>
              <div className="vault-card-desc">
                Provider: {firebaseUser.providerId || 'firebase'} • UID: {firebaseUser.uid.slice(0, 14)}...
              </div>
              {!firebaseUser.isAnonymous && firebaseUser.email && (
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {firebaseUser.emailVerified ? (
                    <span style={{ fontSize: '11px', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                      ✓ Email Verified
                    </span>
                  ) : (
                    <>
                      <span style={{ fontSize: '11px', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        ⚠ Email Unverified
                      </span>
                      <button
                        type="button"
                        className="vault-btn-secondary"
                        style={{ padding: '3px 8px', fontSize: '11px', height: 'auto', minHeight: 'unset' }}
                        onClick={handleSendVerificationEmail}
                        disabled={isSendingVerification}
                      >
                        {isSendingVerification ? 'Sending...' : 'Resend Verification Email'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="vault-btn-danger"
              onClick={handleSignOut}
              disabled={isSubmitting}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="email"
              className="vault-input"
              placeholder="Email (e.g. user@example.com)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onPointerDown={engageFocus}
              onFocus={engageFocus}
              onBlur={disengageFocus}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEmailAuth(false)
              }}
              spellCheck={false}
            />
            <input
              type="password"
              className="vault-input"
              placeholder="Password (minimum 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onPointerDown={engageFocus}
              onFocus={engageFocus}
              onBlur={disengageFocus}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEmailAuth(false)
              }}
            />

            <div className="vault-grid-2">
              <button
                type="button"
                className="vault-btn-primary"
                onClick={() => handleEmailAuth(false)}
                disabled={isSubmitting}
              >
                Sign In
              </button>
              <button
                type="button"
                className="vault-btn-secondary"
                onClick={() => handleEmailAuth(true)}
                disabled={isSubmitting}
              >
                Create Account
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '2px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
              <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                or
              </span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />
            </div>

            <button
              type="button"
              className="vault-btn-secondary"
              onClick={handleAnonymousSignIn}
              disabled={isSubmitting}
            >
              Continue as Guest (Instant Cloud Vault)
            </button>

            <button
              type="button"
              className="vault-btn-disabled-pale"
              disabled
              title="Native Google OAuth for desktop is slated for an upcoming release."
            >
              <svg width="13" height="13" viewBox="0 0 24 24" style={{ opacity: 0.6 }}>
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Sign in with Google
              <span className="vault-badge-soon">Soon</span>
            </button>
          </div>
        )}
      </div>

      {/* Card 3: Cloud Sync Preferences */}
      <div className="vault-card">
        <div className="vault-card-header">
          <div className="vault-card-label">PREFERENCES</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <div className="vault-card-title">Continuous Cloud Sync</div>
            <div className="vault-card-desc">Automatically upload newly captured items and download remote updates.</div>
          </div>
          <button
            type="button"
            className={`setting-toggle${settings.cloudSyncEnabled ?? true ? ' checked' : ''}`}
            onClick={() => {
              const next = !(settings.cloudSyncEnabled ?? true)
              playToggleSound(next)
              patch({ cloudSyncEnabled: next })
            }}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
      </div>

      {/* Card 4: Local Snapshot & Offline Vault (.edvault) */}
      <div className="vault-card">
        <div className="vault-card-header">
          <div className="vault-card-label">LOCAL SNAPSHOT & OFFLINE VAULT</div>
          <div className="vault-card-title">Snapshot Archive (.edvault)</div>
          <div className="vault-card-desc">
            Export all clipboard history, binary images, and settings into a single compressed .edvault archive for offline migration or backup.
          </div>
        </div>

        <div className="vault-grid-2">
          <button
            type="button"
            className="vault-btn-secondary"
            onClick={handleExportVault}
            disabled={isSubmitting}
          >
            Export .edvault
          </button>
          <button
            type="button"
            className="vault-btn-secondary"
            onClick={handleImportVault}
            disabled={isSubmitting}
          >
            Restore .edvault
          </button>
        </div>

        {vaultMsg && (
          <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>
            ✓ {vaultMsg}
          </div>
        )}
      </div>

      {/* Card 5: Custom Firebase Configuration (BYO Database) */}
      <div className="vault-card">
        <div className="vault-card-header">
          <div className="vault-card-label">CUSTOM FIREBASE CONFIGURATION</div>
          <div className="vault-card-title">Bring Your Own Firebase</div>
          <div className="vault-card-desc">
            Override the default cloud database with your own Firebase project. Config is validated with a live preflight check and encrypted via Windows DPAPI.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="vault-btn-secondary"
            onClick={() => {
              playButtonClickSound()
              setShowConfigInput(!showConfigInput)
            }}
            style={{ flex: 1 }}
          >
            {showConfigInput ? 'Hide Configuration' : 'Configure Custom Database'}
          </button>
          {settings.customFirebaseConfig && (
            <button
              type="button"
              className="vault-btn-danger"
              onClick={handleResetCustomConfig}
              disabled={isSubmitting}
            >
              Reset
            </button>
          )}
        </div>

        <AnimatePresence>
          {showConfigInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}
            >
              <textarea
                className="vault-textarea"
                placeholder={'Paste Firebase Config (JSON, JS snippet, or .env):\nconst firebaseConfig = {\n  apiKey: "...",\n  projectId: "..."\n};'}
                value={customConfigInput}
                onChange={(e) => setCustomConfigInput(e.target.value)}
                onPointerDown={engageFocus}
                onFocus={engageFocus}
                onBlur={disengageFocus}
                rows={5}
                spellCheck={false}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="vault-btn-secondary"
                  onClick={handleCopySetupRules}
                  style={{ fontSize: '11px' }}
                >
                  {rulesCopied ? '✓ Rules Copied!' : 'Copy Security Rules'}
                </button>
                <button
                  type="button"
                  className="vault-btn-primary"
                  onClick={handleVerifyAndConnect}
                  disabled={isSubmitting || !customConfigInput.trim()}
                >
                  Connect & Encrypt
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
                <a
                  href="https://github.com/imsovikde/Edge-Drop/blob/main/docs/FIREBASE_SETUP.md"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '11px', textDecoration: 'underline' }}
                >
                  Setup Guide & Docs ↗
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

