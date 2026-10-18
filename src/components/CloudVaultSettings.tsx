import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/appStore'
import { edge } from '../lib/edge'
import { Toggle } from './Toggle'
import { playButtonClickSound, playToggleSound } from '../lib/soundEffects'
import type { RollingBackupMetadata, FirebaseConnectivityResult } from '../../shared/types'

export function CloudVaultSettings({ isHorizontal }: { isHorizontal?: boolean }) {
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)
  const pushToast = useStore((s) => s.pushToast)
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
  const [isCheckingVerification, setIsCheckingVerification] = useState(false)
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false)

  // ── Telemetry & Rolling Backup State ─────────────────────────────────────
  const [showTelemetry, setShowTelemetry] = useState(false)
  const [rollingBackups, setRollingBackups] = useState<RollingBackupMetadata[]>([])
  const [isTestingConnectivity, setIsTestingConnectivity] = useState(false)
  const [testResult, setTestResult] = useState<FirebaseConnectivityResult | null>(null)
  const [isCreatingRolling, setIsCreatingRolling] = useState(false)
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null)

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

  // ── Rolling Backups Lifecycle & Test Connectivity ────────────────────────
  const loadBackups = useCallback(() => {
    edge.listRollingBackups().then((b) => {
      if (Array.isArray(b)) setRollingBackups(b)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadBackups()
  }, [loadBackups])

  const handleTestConnectivity = async () => {
    playButtonClickSound()
    setIsTestingConnectivity(true)
    setTestResult(null)
    try {
      const res = await edge.testFirebaseConnectivity()
      setTestResult(res)
      if (res.ok) {
        pushToast({ id: 'test-ok', message: `Firebase reachable (${res.latencyMs}ms)`, tone: 'info' })
      } else {
        pushToast({ id: 'test-err', message: res.error || 'Firebase connectivity failed', tone: 'error' })
      }
    } catch (err: any) {
      setTestResult({ ok: false, latencyMs: 0, authOk: false, firestoreOk: false, error: err?.message || 'Check failed' })
    } finally {
      setIsTestingConnectivity(false)
    }
  }

  const handleCreateRollingBackup = async () => {
    playButtonClickSound()
    setIsCreatingRolling(true)
    try {
      const b = await edge.createRollingBackup()
      loadBackups()
      pushToast({ id: 'backup-created', message: `Rolling backup created (${b.itemCount} items)`, tone: 'info' })
    } catch (err: any) {
      pushToast({ id: 'backup-err', message: err?.message || 'Failed to create backup', tone: 'error' })
    } finally {
      setIsCreatingRolling(false)
    }
  }

  const handleRestoreRollingBackup = async (id: string) => {
    playButtonClickSound()
    setRestoringBackupId(id)
    try {
      const res = await edge.restoreRollingBackup(id)
      if (res.success) {
        pushToast({ id: 'backup-restored', message: `Restored ${res.restoredItems} items and ${res.restoredImages} images!`, tone: 'info' })
      }
    } catch (err: any) {
      pushToast({ id: 'restore-err', message: err?.message || 'Failed to restore backup', tone: 'error' })
    } finally {
      setRestoringBackupId(null)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  // ── Email Verification Check & Dispatch ────────────────────────────────
  const handleCheckVerification = async () => {
    playButtonClickSound()
    setIsCheckingVerification(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      const res = await edge.checkEmailVerification()
      if (res.verified) {
        setAuthSuccess(res.message)
        pushToast({ id: 'verify-success', message: res.message, tone: 'info' })
      } else {
        setAuthError(res.message)
        pushToast({ id: 'verify-pending', message: res.message, tone: 'info' })
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to check verification status'
      setAuthError(msg)
      pushToast({ id: 'verify-error', message: msg, tone: 'error' })
    } finally {
      setIsCheckingVerification(false)
    }
  }

  const handleSendVerificationEmail = async () => {
    playButtonClickSound()
    setIsSendingVerification(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      const res = await edge.sendVerificationEmail()
      if (res.ok) {
        setAuthSuccess(res.message)
        pushToast({ id: 'verify-sent', message: res.message, tone: 'info' })
      } else {
        setAuthError(res.message)
        pushToast({ id: 'verify-fail', message: res.message, tone: 'error' })
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to send verification email'
      setAuthError(msg)
      pushToast({ id: 'verify-err', message: msg, tone: 'error' })
    } finally {
      setIsSendingVerification(false)
    }
  }

  const handleSendPasswordReset = async () => {
    playButtonClickSound()
    setIsSendingPasswordReset(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      const targetEmail = firebaseUser?.email || email.trim()
      const res = await edge.sendPasswordResetEmail(targetEmail)
      if (res.ok) {
        setAuthSuccess(res.message)
        pushToast({ id: 'reset-sent', message: res.message, tone: 'info' })
      } else {
        setAuthError(res.message)
        pushToast({ id: 'reset-fail', message: res.message, tone: 'error' })
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to send password reset email'
      setAuthError(msg)
      pushToast({ id: 'reset-err', message: msg, tone: 'error' })
    } finally {
      setIsSendingPasswordReset(false)
    }
  }

  // ── Auth Handlers ───────────────────────────────────────────────────────
  const handleAnonymousSignIn = async () => {
    playButtonClickSound()
    setIsSubmitting(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      await edge.signInAnonymous()
      setAuthSuccess('Signed in as Guest with cloud backup active!')
      pushToast({ id: 'anon-ok', message: 'Guest vault activated with continuous cloud backup', tone: 'info' })
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
        setAuthSuccess('Account created! A verification link was dispatched to your email.')
        pushToast({ id: 'reg-ok', message: 'Account created! Verification link sent to your email.', tone: 'info' })
      } else {
        await edge.signInEmail(email.trim(), password.trim())
        setAuthSuccess('Signed in successfully!')
        pushToast({ id: 'login-ok', message: 'Signed in successfully! Vault connected.', tone: 'info' })
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
      pushToast({ id: 'signout-ok', message: 'Signed out. Local clipboard items preserved.', tone: 'info' })
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
      pushToast({ id: 'sync-ok', message: 'Force sync complete: vaults reconciled.', tone: 'info' })
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
      pushToast({ id: 'sync-triggered', message: 'Sync cycle initiated in background.', tone: 'info' })
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
        const msg = `Exported ${res.itemCount} items (${res.imageCount} images) to ${res.path}`
        setVaultMsg(msg)
        pushToast({ id: 'export-ok', message: msg, tone: 'info' })
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
        const msg = `Restored ${res.restoredItems} items (${res.restoredImages} images) successfully.`
        setVaultMsg(msg)
        pushToast({ id: 'import-ok', message: msg, tone: 'info' })
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
        pushToast({ id: 'byo-ok', message: `Connected to project "${res.config.projectId}"!`, tone: 'info' })
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
      pushToast({ id: 'byo-reset', message: 'Reset to default Edge-Drop cloud backend.', tone: 'info' })
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
      pushToast({ id: 'rules-copied', message: 'Security rules copied to clipboard!', tone: 'info' })
    }).catch(() => {})
  }

  // ── One-Click Issue Diagnostics ────────────────────────────────────────
  const handleReportIssue = async () => {
    playButtonClickSound()
    try {
      const diag = await edge.getDiagnostics()
      const url = `https://github.com/imsovikde/Edge-Drop/issues/new?title=%5BBug%5D%3A+&body=${encodeURIComponent(diag)}`
      window.open(url, '_blank')
    } catch {
      window.open('https://github.com/imsovikde/Edge-Drop/issues/new', '_blank')
    }
  }

  const handleCopyDiagnostics = async () => {
    playButtonClickSound()
    try {
      const diag = await edge.getDiagnostics()
      await navigator.clipboard.writeText(diag)
      pushToast({ id: 'diag-copy', message: 'Diagnostics copied to clipboard!', tone: 'info' })
    } catch {
      pushToast({ id: 'diag-copy-err', message: 'Failed to copy diagnostics', tone: 'error' })
    }
  }

  // Status Beacon Calculation
  const isError = cloudSyncState?.status === 'error' || !!authError || !!cloudSyncState?.error
  const isSyncing = !isError && (cloudSyncState?.status === 'syncing' || isSubmitting)
  const isConnected = !!firebaseUser

  const statusBeaconColor = isError
    ? '#f44336'
    : isSyncing
      ? '#ffb300'
      : isConnected
        ? '#10b981'
        : '#3b82f6'

  const statusText = isError
    ? cloudSyncState?.error ? `Sync Alert: ${cloudSyncState.error}` : (authError || 'Sync error or offline')
    : isSyncing
      ? cloudSyncState?.progress
        ? `${cloudSyncState.progress.stage} (${cloudSyncState.progress.current}/${cloudSyncState.progress.total})`
        : 'Syncing in progress...'
      : isConnected
        ? firebaseUser.isAnonymous
          ? 'Guest Vault Active'
          : `Linked: ${firebaseUser.email || firebaseUser.displayName || firebaseUser.uid.slice(0, 10)}`
        : 'Local Storage Only (Unlinked)'

  // ──────────────────────────────────────────────────────────────────────────
  // HORIZONTAL SHELF RENDERING (Top / Bottom Dock Position)
  // ──────────────────────────────────────────────────────────────────────────
  if (isHorizontal) {
    return (
      <>
        {/* ── Sub-group Divider ── */}
        <div className="shelf-section-divider">
          <span className="shelf-section-divider-text">VAULT & SYNC</span>
        </div>

        {/* Card 1: Cloud Sync Status Beacon */}
        <div className="settings-shelf-card vault-shelf-card">
          <div className="shelf-card-top">
            <div className="setting-group-label">STATUS & VAULT BEACON</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: statusBeaconColor,
                  boxShadow: `0 0 8px ${statusBeaconColor}88`,
                  flexShrink: 0
                }}
              />
              <div className="setting-title" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {statusText}
              </div>
            </div>
            <div className="setting-desc" style={{ fontSize: 10.5, lineHeight: 1.3 }}>
              {isConnected
                ? 'Clipboard clips, images, and stacks are automatically synced.'
                : 'Connect an account to enable automatic multi-device sync.'}
            </div>
            {cloudSyncState?.error && (
              <div
                style={{
                  marginTop: 6,
                  padding: '5px 8px',
                  borderRadius: 6,
                  background: 'rgba(244, 67, 54, 0.12)',
                  border: '1px solid rgba(244, 67, 54, 0.25)',
                  color: '#ff8a80',
                  fontSize: 10,
                  lineHeight: 1.3,
                  wordBreak: 'break-word'
                }}
              >
                {cloudSyncState.error}
              </div>
            )}
          </div>
          <div className="shelf-card-bottom">
            {isConnected ? (
              <div className="setting-pills">
                <button
                  type="button"
                  className="pill"
                  onClick={handleTriggerSync}
                  disabled={isSyncing}
                >
                  Sync Now
                </button>
                <button
                  type="button"
                  className="pill active"
                  onClick={handleForceSync}
                  disabled={isSubmitting}
                >
                  Force Sync
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="pill active"
                onClick={handleAnonymousSignIn}
                disabled={isSubmitting}
                style={{ width: '100%' }}
              >
                Instant Guest Vault
              </button>
            )}
          </div>
        </div>

        {/* Card 2: Account Access & Verification */}
        <div className="settings-shelf-card vault-auth-card">
          <div className="shelf-card-top">
            <div className="setting-group-label">ACCOUNT & VERIFICATION</div>
            {isConnected ? (
              <div>
                <div className="setting-title" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {firebaseUser.isAnonymous ? 'Guest User' : firebaseUser.email || 'Connected Account'}
                </div>
                {!firebaseUser.isAnonymous && firebaseUser.email && (
                  <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {firebaseUser.emailVerified ? (
                      <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                        ✓ Email Verified
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                        ⚠ Email Unverified
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input
                  type="email"
                  className="vault-input"
                  style={{ height: 26, padding: '2px 8px', fontSize: 11 }}
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onPointerDown={engageFocus}
                  onFocus={engageFocus}
                  onBlur={disengageFocus}
                  spellCheck={false}
                />
                <input
                  type="password"
                  className="vault-input"
                  style={{ height: 26, padding: '2px 8px', fontSize: 11 }}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onPointerDown={engageFocus}
                  onFocus={engageFocus}
                  onBlur={disengageFocus}
                />
              </div>
            )}
          </div>
          <div className="shelf-card-bottom">
            {isConnected ? (
              <div className="setting-pills">
                {!firebaseUser.isAnonymous && !firebaseUser.emailVerified && (
                  <button
                    type="button"
                    className="pill active"
                    onClick={handleCheckVerification}
                    disabled={isCheckingVerification}
                    title="Check verification status if you already clicked the link in your email"
                  >
                    {isCheckingVerification ? 'Checking...' : 'Check Status'}
                  </button>
                )}
                {!firebaseUser.isAnonymous && (
                  <button
                    type="button"
                    className="pill"
                    onClick={handleSendPasswordReset}
                    disabled={isSendingPasswordReset}
                    title="Send password reset link to your email"
                  >
                    {isSendingPasswordReset ? 'Sending...' : 'Reset Pass'}
                  </button>
                )}
                <button
                  type="button"
                  className="pill danger"
                  onClick={handleSignOut}
                  disabled={isSubmitting}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="setting-pills">
                <button
                  type="button"
                  className="pill active"
                  onClick={() => handleEmailAuth(false)}
                  disabled={isSubmitting}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className="pill"
                  onClick={() => handleEmailAuth(true)}
                  disabled={isSubmitting}
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Continuous Cloud Sync Toggle */}
        <div className="settings-shelf-card vault-sync-card">
          <div className="shelf-card-top">
            <div className="setting-group-label">PREFERENCES</div>
          </div>
          <div className="shelf-card-inline">
            <div className="shelf-card-inline-text">
              <div className="setting-title">Continuous Cloud Sync</div>
              <div className="setting-desc">Auto-sync clips and images across devices</div>
            </div>
            <div className="shelf-card-inline-action">
              <Toggle
                checked={settings.cloudSyncEnabled ?? true}
                onChange={(v) => {
                  playToggleSound(v)
                  patch({ cloudSyncEnabled: v })
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 4: Local Snapshot & Archive (.edvault) */}
        <div className="settings-shelf-card vault-backup-card">
          <div className="shelf-card-top">
            <div className="setting-group-label">LOCAL SNAPSHOT</div>
            <div className="setting-title">Vault Archive (.edvault)</div>
            <div className="setting-desc">
              {rollingBackups.length > 0 ? `${rollingBackups.length} rolling backups available` : 'Export or restore offline vault backup'}
            </div>
          </div>
          <div className="shelf-card-bottom">
            <div className="setting-pills">
              <button
                type="button"
                className="pill active"
                onClick={handleCreateRollingBackup}
                disabled={isCreatingRolling}
              >
                {isCreatingRolling ? 'Saving...' : 'Instant Roll'}
              </button>
              <button
                type="button"
                className="pill"
                onClick={handleExportVault}
                disabled={isSubmitting}
              >
                Export
              </button>
              <button
                type="button"
                className="pill"
                onClick={handleImportVault}
                disabled={isSubmitting}
              >
                Restore
              </button>
            </div>
          </div>
        </div>

        {/* Card 5: Custom Firebase Backend */}
        <div className="settings-shelf-card vault-byo-card">
          <div className="shelf-card-top">
            <div className="setting-group-label">CUSTOM BACKEND</div>
            <div className="setting-title">Bring Your Own Firebase</div>
            <div className="setting-desc">
              {settings.customFirebaseConfig ? 'Custom database connected' : 'Override with own project'}
            </div>
          </div>
          <div className="shelf-card-bottom">
            <div className="setting-pills">
              <button
                type="button"
                className="pill"
                onClick={() => {
                  playButtonClickSound()
                  setShowConfigInput(!showConfigInput)
                }}
              >
                {showConfigInput ? 'Hide' : 'Configure'}
              </button>
              <button
                type="button"
                className="pill"
                onClick={handleTestConnectivity}
                disabled={isTestingConnectivity}
              >
                {isTestingConnectivity ? 'Testing...' : 'Test'}
              </button>
              {settings.customFirebaseConfig && (
                <button
                  type="button"
                  className="pill danger"
                  onClick={handleResetCustomConfig}
                  disabled={isSubmitting}
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card 6: One-Click Diagnostics & Reporting */}
        <div className="settings-shelf-card vault-diag-card">
          <div className="shelf-card-top">
            <div className="setting-group-label">DIAGNOSTICS & HELP</div>
            <div className="setting-title">Report Issue</div>
            <div className="setting-desc">One-click issue template with pre-filled device info</div>
          </div>
          <div className="shelf-card-bottom">
            <div className="setting-pills">
              <button
                type="button"
                className="pill active"
                onClick={handleReportIssue}
              >
                Report ↗
              </button>
              <button
                type="button"
                className="pill"
                onClick={handleCopyDiagnostics}
              >
                Copy Diag
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VERTICAL STACK RENDERING (Left / Right Dock Position)
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Section Divider ── */}
      <div className="setting-section-divider">
        <span className="setting-section-divider-text">
          CLOUD VAULT & MULTI-DEVICE SYNC
        </span>
      </div>

      {/* Global Notice Banners */}
      {authError && (
        <div className="vault-error-banner" style={{ margin: '0 0 10px 0' }}>
          <div>{authError}</div>
          <button
            type="button"
            onClick={handleReportIssue}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: '#ff8a80',
              fontSize: '11px',
              textDecoration: 'underline',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            Report Issue on GitHub (Auto-filled Diagnostics) ↗
          </button>
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
      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">STATUS & VAULT BEACON</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: statusBeaconColor,
                boxShadow: `0 0 8px ${statusBeaconColor}88`,
                flexShrink: 0
              }}
            />
            <div className="setting-title">{statusText}</div>
          </div>
          <div className="setting-desc">
            {isConnected
              ? 'Your clipboard history, high-res images, and stacks are automatically backed up and synced in real-time.'
              : 'Sign in to automatically sync your clipboard history and images across your desktop devices.'}
          </div>
          {cloudSyncState?.pendingMutations ? (
            <div style={{ fontSize: '11px', color: '#ffb300', marginTop: '4px' }}>
              {cloudSyncState.pendingMutations} pending item(s) in offline write-ahead log
            </div>
          ) : null}
          {cloudSyncState?.error && (
            <div
              style={{
                marginTop: 8,
                padding: '6px 10px',
                borderRadius: 8,
                background: 'rgba(244, 67, 54, 0.12)',
                border: '1px solid rgba(244, 67, 54, 0.25)',
                color: '#ff8a80',
                fontSize: 11,
                lineHeight: 1.35,
                wordBreak: 'break-word'
              }}
            >
              {cloudSyncState.error}
            </div>
          )}
        </div>

        <div className="shelf-card-bottom" style={{ marginTop: 8 }}>
          <div className="setting-pills">
            {isConnected && (
              <>
                <button
                  type="button"
                  className="pill"
                  onClick={handleTriggerSync}
                  disabled={isSyncing}
                >
                  Sync Now
                </button>
                <button
                  type="button"
                  className="pill active"
                  onClick={handleForceSync}
                  disabled={isSubmitting}
                >
                  Force Sync
                </button>
              </>
            )}
            <button
              type="button"
              className={`pill ${showTelemetry ? 'active' : ''}`}
              style={{ minWidth: 'max-content', whiteSpace: 'nowrap' }}
              onClick={() => {
                playButtonClickSound()
                setShowTelemetry(!showTelemetry)
              }}
            >
              {showTelemetry ? 'Hide Telemetry' : 'Telemetry HUD'}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showTelemetry && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="vault-telemetry-box"
            >
              <div className="vault-telemetry-header">
                <span>Real-Time Sync Telemetry</span>
                <span style={{ fontSize: '10px', color: '#10b981' }}>● Live</span>
              </div>
              <div className="vault-telemetry-grid">
                <div className="vault-telemetry-cell">
                  <span className="vault-telemetry-label">Latency</span>
                  <span className="vault-telemetry-val">
                    {cloudSyncState?.latencyMs !== undefined ? `${cloudSyncState.latencyMs} ms` : '-'}
                  </span>
                </div>
                <div className="vault-telemetry-cell">
                  <span className="vault-telemetry-label">Cloud Docs</span>
                  <span className="vault-telemetry-val">
                    {cloudSyncState?.cloudItemCount ?? 0}
                  </span>
                </div>
                <div className="vault-telemetry-cell">
                  <span className="vault-telemetry-label">WAL Pending</span>
                  <span className="vault-telemetry-val">
                    {cloudSyncState?.pendingMutations ?? 0}
                  </span>
                </div>
                <div className="vault-telemetry-cell">
                  <span className="vault-telemetry-label">Network</span>
                  <span
                    className="vault-telemetry-val"
                    style={{
                      color:
                        cloudSyncState?.networkQuality === 'optimal'
                          ? '#10b981'
                          : cloudSyncState?.networkQuality === 'moderate'
                          ? '#ffb300'
                          : '#f87171',
                      textTransform: 'capitalize'
                    }}
                  >
                    {cloudSyncState?.networkQuality || 'Optimal'}
                  </span>
                </div>
              </div>
              {cloudSyncState?.lastSyncedAt && (
                <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.45)', textAlign: 'right', marginTop: '2px' }}>
                  Last sync: {new Date(cloudSyncState.lastSyncedAt).toLocaleTimeString()}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Card 2: Authentication & Account Controls */}
      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">ACCOUNT ACCESS</div>
        </div>

        {isConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <div className="setting-title">
                {firebaseUser.isAnonymous ? 'Guest Account' : firebaseUser.email || 'Connected Account'}
              </div>
              <div className="setting-desc">
                Provider: {firebaseUser.providerId || 'firebase'} • UID: {firebaseUser.uid.slice(0, 14)}...
              </div>
              {!firebaseUser.isAnonymous && firebaseUser.email && (
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {firebaseUser.emailVerified ? (
                    <span style={{ fontSize: '12px', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                      ✓ Email Verified
                    </span>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                      <span style={{ fontSize: '12px', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                        ⚠ Email Unverified
                      </span>
                      <div className="setting-pills" style={{ marginTop: 4 }}>
                        <button
                          type="button"
                          className="pill active"
                          onClick={handleCheckVerification}
                          disabled={isCheckingVerification}
                        >
                          {isCheckingVerification ? 'Checking...' : 'Check Verification Status'}
                        </button>
                        <button
                          type="button"
                          className="pill"
                          onClick={handleSendVerificationEmail}
                          disabled={isSendingVerification}
                        >
                          {isSendingVerification ? 'Sending...' : 'Resend Email'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="setting-pills" style={{ marginTop: 4 }}>
              {!firebaseUser.isAnonymous && (
                <button
                  type="button"
                  className="pill"
                  onClick={handleSendPasswordReset}
                  disabled={isSendingPasswordReset}
                >
                  {isSendingPasswordReset ? 'Sending...' : 'Change Password'}
                </button>
              )}
              <button
                type="button"
                className="pill danger"
                onClick={handleSignOut}
                disabled={isSubmitting}
              >
                Sign Out
              </button>
            </div>
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

            <div className="setting-pills">
              <button
                type="button"
                className="pill active"
                onClick={() => handleEmailAuth(false)}
                disabled={isSubmitting}
              >
                Sign In
              </button>
              <button
                type="button"
                className="pill"
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
              className="pill"
              onClick={handleAnonymousSignIn}
              disabled={isSubmitting}
              style={{ width: '100%', height: 32 }}
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

      {/* Card 3: Continuous Cloud Sync Preference */}
      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">PREFERENCES</div>
        </div>
        <div className="shelf-card-inline">
          <div className="shelf-card-inline-text">
            <div className="setting-title">Continuous Cloud Sync</div>
            <div className="setting-desc">Automatically upload newly captured items and download remote updates.</div>
          </div>
          <div className="shelf-card-inline-action">
            <Toggle
              checked={settings.cloudSyncEnabled ?? true}
              onChange={(v) => {
                playToggleSound(v)
                patch({ cloudSyncEnabled: v })
              }}
            />
          </div>
        </div>
      </div>

      {/* Card 4: Local Snapshot & Offline Vault (.edvault) */}
      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">LOCAL SNAPSHOT & OFFLINE VAULT</div>
          <div className="setting-title">Snapshot Archive (.edvault)</div>
          <div className="setting-desc">
            Export all clipboard history, binary images, and settings into a single compressed .edvault archive for offline migration or backup.
          </div>
        </div>

        <div className="shelf-card-bottom" style={{ marginTop: 8 }}>
          <div className="setting-pills">
            <button
              type="button"
              className="pill active"
              onClick={handleCreateRollingBackup}
              disabled={isCreatingRolling}
            >
              {isCreatingRolling ? 'Saving Snapshot...' : 'Create Instant Backup'}
            </button>
            <button
              type="button"
              className="pill"
              onClick={handleExportVault}
              disabled={isSubmitting}
            >
              Export Archive...
            </button>
            <button
              type="button"
              className="pill"
              onClick={handleImportVault}
              disabled={isSubmitting}
            >
              Restore File...
            </button>
          </div>
        </div>

        {rollingBackups.length > 0 && (
          <div className="rolling-backup-section">
            <div className="rolling-backup-header">
              <span>Rolling Backups (Auto-pruned to 5)</span>
              <span>{rollingBackups.length} / 5</span>
            </div>
            <div className="rolling-backup-list">
              {rollingBackups.map((b) => (
                <div key={b.id} className="rolling-backup-item">
                  <div className="rolling-backup-info">
                    <span className="rolling-backup-time">
                      {new Date(b.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="rolling-backup-meta">
                      {b.itemCount} items • {formatBytes(b.byteSize)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="pill active"
                    style={{ fontSize: '10.5px', padding: '3px 8px', minHeight: '24px' }}
                    onClick={() => handleRestoreRollingBackup(b.id)}
                    disabled={restoringBackupId === b.id}
                  >
                    {restoringBackupId === b.id ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {vaultMsg && (
          <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>
            ✓ {vaultMsg}
          </div>
        )}
      </div>

      {/* Card 5: Custom Firebase Configuration (BYO Database) */}
      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">CUSTOM FIREBASE CONFIGURATION</div>
          <div className="setting-title">Bring Your Own Firebase</div>
          <div className="setting-desc">
            Override the default cloud database with your own Firebase project. Config is validated with a live preflight check and encrypted via Windows DPAPI.
          </div>
        </div>

        <div className="shelf-card-bottom" style={{ marginTop: 8 }}>
          <div className="setting-pills">
            <button
              type="button"
              className="pill"
              onClick={() => {
                playButtonClickSound()
                setShowConfigInput(!showConfigInput)
              }}
            >
              {showConfigInput ? 'Hide Configuration' : 'Configure Custom Database'}
            </button>
            <button
              type="button"
              className="pill"
              onClick={handleTestConnectivity}
              disabled={isTestingConnectivity}
            >
              {isTestingConnectivity ? 'Testing...' : 'Test Connection'}
            </button>
            {settings.customFirebaseConfig && (
              <button
                type="button"
                className="pill danger"
                onClick={handleResetCustomConfig}
                disabled={isSubmitting}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {testResult && (
          <div className={`vault-test-result ${testResult.ok ? 'success' : 'error'}`}>
            <span>{testResult.ok ? '✓' : '⚠'}</span>
            <span>
              {testResult.ok
                ? `Connection successful (${testResult.latencyMs}ms) • Auth: OK • Firestore: OK`
                : `Check failed (${testResult.latencyMs}ms): ${testResult.error}`}
            </span>
          </div>
        )}

        <AnimatePresence>
          {showConfigInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}
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

              <div className="setting-pills">
                <button
                  type="button"
                  className="pill"
                  onClick={handleCopySetupRules}
                  style={{ fontSize: '11px' }}
                >
                  {rulesCopied ? '✓ Rules Copied!' : 'Copy Security Rules'}
                </button>
                <button
                  type="button"
                  className="pill active"
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

      {/* Card 6: One-Click Diagnostics & GitHub Issue Template */}
      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">DIAGNOSTICS & BUG REPORTING</div>
          <div className="setting-title">Automated Issue Diagnostics</div>
          <div className="setting-desc">
            Instantly prepare an issue report with your non-sensitive system environment, app version, screen scale, and sync state pre-filled.
          </div>
        </div>
        <div className="shelf-card-bottom" style={{ marginTop: 8 }}>
          <div className="setting-pills">
            <button
              type="button"
              className="pill active"
              onClick={handleReportIssue}
            >
              Report Issue (Auto-filled) ↗
            </button>
            <button
              type="button"
              className="pill"
              onClick={handleCopyDiagnostics}
            >
              Copy Diagnostics
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
