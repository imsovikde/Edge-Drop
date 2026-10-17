import { useState } from 'react'
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
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [showConfigInput, setShowConfigInput] = useState(false)
  const [customConfigJson, setCustomConfigJson] = useState('')
  const [configSaved, setConfigSaved] = useState(false)

  const handleGoogleSignIn = async () => {
    playButtonClickSound()
    setIsSubmitting(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      await edge.signInGoogle()
      setAuthSuccess('Successfully connected with Google!')
    } catch (err: any) {
      setAuthError(err?.message || 'Google sign-in failed or was cancelled')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAnonymousSignIn = async () => {
    playButtonClickSound()
    setIsSubmitting(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      await edge.signInAnonymous()
      setAuthSuccess('Signed in as Guest with cloud backup enabled!')
    } catch (err: any) {
      setAuthError(err?.message || 'Guest sign-in failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEmailAuth = async (isRegister: boolean) => {
    if (!email || !password) {
      setAuthError('Please enter both email and password.')
      return
    }
    playButtonClickSound()
    setIsSubmitting(true)
    setAuthError(null)
    setAuthSuccess(null)
    try {
      if (isRegister) {
        await edge.signUpEmail(email, password)
        setAuthSuccess('Account created and signed in successfully!')
      } else {
        await edge.signInEmail(email, password)
        setAuthSuccess('Signed in successfully!')
      }
      setEmail('')
      setPassword('')
      setShowEmailForm(false)
    } catch (err: any) {
      setAuthError(err?.message || (isRegister ? 'Registration failed' : 'Sign-in failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    playButtonClickSound()
    setIsSubmitting(true)
    try {
      await edge.signOut()
      setAuthSuccess('Signed out. Local clipboard items preserved.')
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to sign out')
    } finally {
      setIsSubmitting(false)
    }
  }

  const [vaultMsg, setVaultMsg] = useState<string | null>(null)

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

  const handleTriggerSync = async () => {
    playButtonClickSound()
    try {
      await edge.triggerSync()
    } catch (err: any) {
      setAuthError(err?.message || 'Sync failed to trigger')
    }
  }

  const handleSaveCustomConfig = async () => {
    playButtonClickSound()
    if (!customConfigJson.trim()) return
    try {
      const ok = await edge.setCustomFirebaseConfig(customConfigJson)
      if (ok) {
        setConfigSaved(true)
        setShowConfigInput(false)
        setTimeout(() => setConfigSaved(false), 3000)
      } else {
        setAuthError('Invalid configuration JSON.')
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to save custom config')
    }
  }

  // Determine status color and label
  const isSyncing = cloudSyncState?.status === 'syncing' || isSubmitting
  const isError = cloudSyncState?.status === 'error' || !!authError
  const isConnected = !!firebaseUser

  const statusBeaconColor = isSyncing
    ? '#ffb300'
    : isError
      ? '#f44336'
      : isConnected
        ? '#4caf50'
        : '#2196f3'

  const statusText = isSyncing
    ? 'Syncing in progress...'
    : isError
      ? 'Sync error or offline'
      : isConnected
        ? firebaseUser.isAnonymous
          ? 'Guest Vault Active'
          : `Linked: ${firebaseUser.email || firebaseUser.displayName || firebaseUser.uid.slice(0, 8)}`
        : 'Local Storage Only (Unlinked)'

  return (
    <div className={isHorizontal ? 'shelf-card-col' : undefined}>
      {/* ── Section Divider ── */}
      <div className={isHorizontal ? 'shelf-section-divider' : 'setting-section-divider'}>
        <span className={isHorizontal ? 'shelf-section-divider-text' : 'setting-section-divider-text'}>
          CLOUD VAULT & MULTI-DEVICE SYNC
        </span>
      </div>

      {/* Card 1: Cloud Sync Status Beacon */}
      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">STATUS & VAULT BEACON</div>
        </div>
        <div className="shelf-card-inline" style={{ alignItems: 'flex-start' }}>
          <div className="shelf-card-inline-text">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: statusBeaconColor,
                  boxShadow: `0 0 8px ${statusBeaconColor}88`,
                  display: 'inline-block'
                }}
              />
              <div className="setting-title" style={{ margin: 0 }}>
                {statusText}
              </div>
            </div>
            <div className="setting-desc">
              {isConnected
                ? 'Your clipboard history, images, and stacks are automatically backed up and synced in real-time.'
                : 'Sign in to automatically sync your clipboard history and images across your desktop devices.'}
            </div>
            {cloudSyncState?.pendingMutations ? (
              <div style={{ fontSize: '11px', color: '#ffb300', marginTop: '4px' }}>
                {cloudSyncState.pendingMutations} pending item(s) in offline journal
              </div>
            ) : null}
          </div>

          <div className="shelf-card-inline-action" style={{ display: 'flex', gap: '6px' }}>
            {isConnected && (
              <>
                <button
                  type="button"
                  className="shelf-btn-secondary"
                  onClick={handleTriggerSync}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  disabled={isSyncing}
                >
                  Sync Now
                </button>
                <button
                  type="button"
                  className="shelf-btn-accent"
                  onClick={handleForceSync}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  disabled={isSubmitting}
                >
                  Force Sync
                </button>
              </>
            )}
          </div>
        </div>

        {/* Notices */}
        {authError && (
          <div
            style={{
              padding: '6px 10px',
              margin: '8px 12px 10px',
              borderRadius: '6px',
              background: 'rgba(244, 67, 54, 0.12)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              color: '#ff8a80',
              fontSize: '11px'
            }}
          >
            {authError}
          </div>
        )}
        {authSuccess && (
          <div
            style={{
              padding: '6px 10px',
              margin: '8px 12px 10px',
              borderRadius: '6px',
              background: 'rgba(76, 175, 80, 0.12)',
              border: '1px solid rgba(76, 175, 80, 0.3)',
              color: '#a5d6a7',
              fontSize: '11px'
            }}
          >
            {authSuccess}
          </div>
        )}
      </div>

      {/* Card 2: Authentication Controls */}
      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">ACCOUNT ACCESS</div>
        </div>

        {isConnected ? (
          <div className="shelf-card-inline">
            <div className="shelf-card-inline-text">
              <div className="setting-title">
                {firebaseUser.isAnonymous ? 'Guest Account' : firebaseUser.email || 'Connected Account'}
              </div>
              <div className="setting-desc">
                Provider: {firebaseUser.providerId || 'firebase'} • UID: {firebaseUser.uid.slice(0, 12)}...
              </div>
            </div>
            <div className="shelf-card-inline-action">
              <button
                type="button"
                className="shelf-btn-secondary"
                onClick={handleSignOut}
                disabled={isSubmitting}
                style={{ fontSize: '11px', padding: '5px 12px', color: '#ff8a80' }}
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              className="shelf-btn-accent"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24">
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
              Sign in with Google (Desktop Flow)
            </button>

            <button
              type="button"
              className="shelf-btn-secondary"
              onClick={handleAnonymousSignIn}
              disabled={isSubmitting}
              style={{ width: '100%', padding: '6px 12px', fontSize: '11.5px' }}
            >
              Continue as Guest (Instant Cloud Backup)
            </button>

            <button
              type="button"
              onClick={() => {
                playButtonClickSound()
                setShowEmailForm(!showEmailForm)
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '11px',
                cursor: 'pointer',
                marginTop: '4px',
                textDecoration: 'underline'
              }}
            >
              {showEmailForm ? 'Hide Email / Password Options' : 'Sign in with Email & Password'}
            </button>

            <AnimatePresence>
              {showEmailForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '6px' }}
                >
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#ffffff',
                      fontSize: '12px'
                    }}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#ffffff',
                      fontSize: '12px'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="shelf-btn-accent"
                      onClick={() => handleEmailAuth(false)}
                      disabled={isSubmitting}
                      style={{ flex: 1, padding: '6px 10px', fontSize: '11.5px' }}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      className="shelf-btn-secondary"
                      onClick={() => handleEmailAuth(true)}
                      disabled={isSubmitting}
                      style={{ flex: 1, padding: '6px 10px', fontSize: '11.5px' }}
                    >
                      Create Account
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Card 3: Cloud Sync Toggle */}
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
            <button
              type="button"
              className={`settings-toggle-btn${settings.cloudSyncEnabled ?? true ? ' active' : ''}`}
              onClick={() => {
                const next = !(settings.cloudSyncEnabled ?? true)
                playToggleSound(next)
                patch({ cloudSyncEnabled: next })
              }}
              style={{
                width: '38px',
                height: '22px',
                borderRadius: '11px',
                background: settings.cloudSyncEnabled ?? true ? '#2196f3' : 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s ease'
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '3px',
                  left: settings.cloudSyncEnabled ?? true ? '19px' : '3px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  transition: 'left 0.2s ease'
                }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Card 4: Local Snapshot & Offline Vault (.edvault) */}
      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">LOCAL SNAPSHOT & OFFLINE VAULT</div>
        </div>
        <div className="shelf-card-inline">
          <div className="shelf-card-inline-text">
            <div className="setting-title">Snapshot Archive (.edvault)</div>
            <div className="setting-desc">
              Export all clipboard history, binary images, and settings into a single compressed .edvault archive for offline migration or backup.
            </div>
          </div>
          <div className="shelf-card-inline-action" style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="shelf-btn-secondary"
              onClick={handleExportVault}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              disabled={isSubmitting}
            >
              Export
            </button>
            <button
              type="button"
              className="shelf-btn-secondary"
              onClick={handleImportVault}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              disabled={isSubmitting}
            >
              Restore
            </button>
          </div>
        </div>
        {vaultMsg && (
          <div style={{ padding: '6px 12px 10px', fontSize: '11px', color: '#10b981' }}>
            ✓ {vaultMsg}
          </div>
        )}
      </div>

      {/* Card 5: Custom Firebase Vault (Encrypted) */}
      <div className="setting-card">
        <div className="shelf-card-top">
          <div className="setting-group-label">CUSTOM FIREBASE CONFIGURATION</div>
        </div>
        <div className="shelf-card-inline">
          <div className="shelf-card-inline-text">
            <div className="setting-title">Bring Your Own Firebase</div>
            <div className="setting-desc">
              Override default cloud project with your own Firebase Web SDK JSON. Config is encrypted at rest using Windows DPAPI.
            </div>
          </div>
          <div className="shelf-card-inline-action">
            <button
              type="button"
              className="shelf-btn-secondary"
              onClick={() => {
                playButtonClickSound()
                setShowConfigInput(!showConfigInput)
              }}
              style={{ fontSize: '11px', padding: '4px 10px' }}
            >
              {showConfigInput ? 'Close' : 'Configure'}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showConfigInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <textarea
                placeholder='{"apiKey": "...", "projectId": "...", "appId": "..."}'
                value={customConfigJson}
                onChange={(e) => setCustomConfigJson(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  resize: 'vertical'
                }}
              />
              <button
                type="button"
                className="shelf-btn-accent"
                onClick={handleSaveCustomConfig}
                style={{ padding: '6px 12px', fontSize: '11.5px', alignSelf: 'flex-end' }}
              >
                Save & Encrypt Config
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {configSaved && (
          <div style={{ padding: '4px 12px 10px', fontSize: '11px', color: '#a5d6a7' }}>
            ✓ Custom configuration saved securely!
          </div>
        )}
      </div>
    </div>
  )
}
