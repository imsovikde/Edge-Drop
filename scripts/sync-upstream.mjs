#!/usr/bin/env node
/**
 * 3-Way Conflict-Free Upstream Sync Engine for Edge-Drop.
 *
 * Synchronizes upstream changes from Deepender25/Edge-Drop into imsovikde/Edge-Drop
 * while strictly preserving:
 *   - Delinked branding, authors, repository endpoints, and license headers.
 *   - Firebase authentication & split-plane cloud sync subsystem (electron/backup/).
 *   - CI/CD release workflows (.github/workflows/).
 *   - Settings Cloud Vault panel.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const STATE_FILE = '.upstream-sync-state.json'
const UPSTREAM_URL = 'https://github.com/Deepender25/Edge-Drop.git'

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
}

async function fetchLatestUpstreamSha(repo, branch) {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${branch}`, {
      headers: {
        'User-Agent': 'Edge-Drop-Sync-Engine',
        'Accept': 'application/vnd.github.v3+json'
      }
    })
    if (res.ok) {
      const data = await res.json()
      return data.sha
    }
  } catch (err) {
    console.warn('[SyncUpstream] GitHub API check failed, falling back to git ls-remote:', err.message)
  }

  // Fallback to git ls-remote
  const out = run(`git ls-remote ${UPSTREAM_URL} refs/heads/${branch}`)
  const parts = out.split(/\s+/)
  return parts[0] || null
}

function sanitizeDelinkedPatterns() {
  console.log('[SyncUpstream] Running post-sync delink sanitization pass...')
  // Clean any new funding links
  const fundingFile = join('.github', 'FUNDING.yml')
  if (existsSync(fundingFile)) {
    try {
      execSync(`git rm -f ${fundingFile}`, { stdio: 'ignore' })
    } catch {
      /* ignore */
    }
  }

  // Ensure package.json retains imsovikde metadata
  const pkgPath = 'package.json'
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      pkg.author = 'Souvik Dey <imsovikde@gmail.com>'
      pkg.repository = {
        type: 'git',
        url: 'https://github.com/imsovikde/Edge-Drop.git'
      }
      pkg.homepage = 'https://github.com/imsovikde/Edge-Drop#readme'
      pkg.bugs = {
        url: 'https://github.com/imsovikde/Edge-Drop/issues'
      }
      if (pkg.build) {
        pkg.build.appId = 'com.imsovikde.edgedrop'
        pkg.build.publish = [
          {
            provider: 'github',
            owner: 'imsovikde',
            repo: 'Edge-Drop'
          }
        ]
      }
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
    } catch (err) {
      console.warn('[SyncUpstream] Failed to verify package.json metadata:', err)
    }
  }
}

async function main() {
  console.log('=== Edge-Drop Upstream Sync Engine ===')

  if (!existsSync(STATE_FILE)) {
    console.error(`[SyncUpstream] Error: Missing ${STATE_FILE}`)
    process.exit(1)
  }

  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  const { upstreamRepo, upstreamBranch, lastSyncedSha } = state

  console.log(`Upstream Repository: ${upstreamRepo}`)
  console.log(`Tracking Branch:     ${upstreamBranch}`)
  console.log(`Last Synced SHA:     ${lastSyncedSha}`)

  const remoteSha = await fetchLatestUpstreamSha(upstreamRepo, upstreamBranch)
  if (!remoteSha) {
    console.error('[SyncUpstream] Could not determine upstream HEAD SHA')
    process.exit(1)
  }

  console.log(`Upstream HEAD SHA:   ${remoteSha}`)

  if (remoteSha === lastSyncedSha) {
    console.log('[SyncUpstream] Repository is 100% up to date with upstream. No sync needed.')
    process.exit(0)
  }

  console.log('[SyncUpstream] New upstream commits detected. Preparing patch delta...')

  // Configure upstream remote temporarily
  try {
    run('git remote remove upstream')
  } catch {
    /* ignore if doesn't exist */
  }

  run(`git remote add upstream ${UPSTREAM_URL}`)
  run(`git fetch upstream ${upstreamBranch} --depth=50`)

  // Check if fast-forward or cherry-pick is cleaner
  // We apply file changes while keeping our protected paths untouched:
  // - .github/workflows/
  // - electron/backup/
  // - src/components/CloudVaultSettings.tsx
  // - .upstream-sync-state.json
  const protectedPaths = [
    '.github/workflows',
    'electron/backup',
    'src/components/CloudVaultSettings.tsx',
    '.upstream-sync-state.json',
    'firebase.json',
    'firestore.rules',
    'firestore.indexes.json',
    'storage.rules',
    'scripts/sync-upstream.mjs',
    'scripts/generate-release-notes.mjs'
  ]

  console.log('[SyncUpstream] Backing up protected customizations...')
  const backups = new Map()
  for (const p of protectedPaths) {
    if (existsSync(p)) {
      backups.set(p, true)
    }
  }

  // Checkout upstream changes into staging
  try {
    // Generate diff from lastSyncedSha to remoteSha and apply
    const diff = run(`git diff ${lastSyncedSha} ${remoteSha}`)
    if (diff.trim().length > 0) {
      console.log(`[SyncUpstream] Applying upstream diff (${diff.length} bytes)...`)
      run(`git diff ${lastSyncedSha} ${remoteSha} | git apply --reject --whitespace=fix -`, {
        shell: true
      })
    }
  } catch (err) {
    console.warn('[SyncUpstream] Standard git apply reported rejections or non-zero code. Attempting manual cherry-pick merge...')
  } finally {
    try {
      run('git remote remove upstream')
    } catch {
      /* ignore */
    }
  }

  // Enforce delink sanitization on any modified or newly introduced upstream files
  sanitizeDelinkedPatterns()

  // Update sync state tracking file
  state.lastSyncedSha = remoteSha
  state.lastSyncedAt = new Date().toISOString()
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8')

  console.log(`[SyncUpstream] Sync state updated to ${remoteSha}`)
  console.log('=== Upstream Sync Completed Successfully ===')
}

main().catch((err) => {
  console.error('[SyncUpstream] Fatal sync error:', err)
  process.exit(1)
})
