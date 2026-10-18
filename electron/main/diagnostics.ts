import { app, screen } from 'electron'
import { release, arch, platform } from 'node:os'
import { loadSettings } from './state'
import { authManager } from '../backup/authManager'
import { syncEngine } from '../backup/syncEngine'

export function getSystemDiagnostics(): string {
  let appVersion = '2.5.0'
  try {
    if (app && typeof app.getVersion === 'function') {
      appVersion = app.getVersion()
    }
  } catch {
    /* ignore */
  }

  let settings: any = {}
  try {
    settings = loadSettings() || {}
  } catch {
    /* ignore */
  }

  let user: any = null
  try {
    user = authManager.getCurrentUser()
  } catch {
    /* ignore */
  }

  let syncState: any = { status: 'idle', isOnline: true, pendingMutations: 0 }
  try {
    syncState = syncEngine.getState() || syncState
  } catch {
    /* ignore */
  }

  let primaryDisplayInfo = 'Unknown'
  try {
    if (screen && typeof screen.getPrimaryDisplay === 'function') {
      const primary = screen.getPrimaryDisplay()
      if (primary && primary.size && primary.workArea) {
        primaryDisplayInfo = `${primary.size.width}x${primary.size.height} (Scale: ${primary.scaleFactor}x, WorkArea: ${primary.workArea.width}x${primary.workArea.height})`
      }
    }
  } catch {
    /* ignore */
  }

  const authDesc = user
    ? user.isAnonymous
      ? 'Guest Vault'
      : `Linked (${user.emailVerified ? 'Email Verified' : 'Email Unverified'}) [Provider: ${user.providerId}]`
    : 'Local Vault (Unlinked)'

  return [
    '### Environment & System Diagnostics',
    `- **Edge-Drop Version**: v${appVersion}`,
    `- **Platform / OS**: ${platform()} ${release()} (${arch()})`,
    `- **Electron / Chromium / Node**: ${process.versions.electron || 'unknown'} / ${process.versions.chrome || 'unknown'} / ${process.versions.node || 'unknown'}`,
    `- **Primary Display**: ${primaryDisplayInfo}`,
    `- **Shelf Placement**: ${settings.stickPosition || 'right'}`,
    `- **Auto-Update Mode**: ${settings.updateMode || 'smart'}`,
    `- **Continuous Cloud Sync**: ${settings.cloudSyncEnabled ?? true ? 'Enabled' : 'Disabled'}`,
    `- **Cloud Sync Status**: ${syncState.status} (Online: ${syncState.isOnline}, Pending Mutations: ${syncState.pendingMutations})`,
    `- **Auth Status**: ${authDesc}`,
    '',
    '### Description of Bug / Behavior',
    '[Please provide clear steps to reproduce what happened]',
    '',
    '### Expected Outcome',
    '[What did you expect to happen?]',
    '',
    '### Actual Outcome',
    '[What actually happened?]'
  ].join('\n')
}
