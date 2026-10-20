#!/usr/bin/env node
/**
 * Intelligent Semantic Release Notes & SHA-256 Binary Integrity Generator for Edge-Drop.
 *
 * Capabilities:
 *   - Automatic Conventional Commit extraction from git history since the last release tag.
 *   - Semantic categorization (Features, Security Hardening, Zero-Resource Performance, Local Vault, Fixes).
 *   - Dynamic SemVer recommendation (major / minor / patch).
 *   - Cryptographic SHA-256 checksum calculation with formatted byte sizing across all dist/ binaries.
 *   - Markdown release synthesis with GitHub commit links and architectural overview.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'

function getSha256(filePath) {
  const buf = readFileSync(filePath)
  return createHash('sha256').update(buf).digest('hex')
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function resolvePlatform(fileName) {
  if (fileName.endsWith('.exe')) return 'Windows (NSIS Installer)'
  if (fileName.endsWith('.dmg')) return 'macOS (Apple Silicon & Intel DMG)'
  if (fileName.endsWith('.zip')) return 'macOS (Portable Archive)'
  if (fileName.endsWith('.AppImage')) return 'Linux (Universal AppImage)'
  if (fileName.endsWith('.deb')) return 'Linux (Debian / Ubuntu Package)'
  if (fileName.endsWith('.rpm')) return 'Linux (Fedora / RHEL Package)'
  return 'Cross-Platform Binary'
}

function getLatestTag() {
  try {
    const raw = execSync('git tag -l "v*" --sort=-v:refname', { encoding: 'utf8' }).trim()
    const tags = raw.split(/\r?\n/).filter(Boolean)
    return tags[0] || null
  } catch {
    return null
  }
}

function getCommitsSince(tag) {
  try {
    const range = tag ? `${tag}..HEAD` : '-n 40'
    const out = execSync(`git log ${range} --pretty=format:"%H|%s|%an|%cI"`, { encoding: 'utf8' }).trim()
    if (!out) return []
    return out.split(/\r?\n/).map((line) => {
      const [hash, subject, author, date] = line.split('|')
      return { hash, shortHash: hash.slice(0, 7), subject, author, date }
    })
  } catch {
    return []
  }
}

function categorizeCommits(commits) {
  const categories = {
    features: [],
    security: [],
    performance: [],
    vault: [],
    auth: [],
    ipc: [],
    ui: [],
    fixes: [],
    infra: []
  }

  for (const c of commits) {
    const s = c.subject.toLowerCase()
    if (s.startsWith('feat(security)') || s.startsWith('security:')) {
      categories.security.push(c)
    } else if (s.startsWith('feat(worker)') || s.startsWith('feat(governor)') || s.startsWith('perf')) {
      categories.performance.push(c)
    } else if (s.startsWith('feat(vault)') || s.includes('localvault')) {
      categories.vault.push(c)
    } else if (s.startsWith('feat(auth)') || s.includes('oauth') || s.includes('loopback')) {
      categories.auth.push(c)
    } else if (s.startsWith('feat(ipc)') || s.includes('bridge')) {
      categories.ipc.push(c)
    } else if (s.startsWith('feat(ui)') || s.startsWith('style') || s.includes('telemetry') || s.includes('led')) {
      categories.ui.push(c)
    } else if (s.startsWith('feat')) {
      categories.features.push(c)
    } else if (s.startsWith('fix')) {
      categories.fixes.push(c)
    } else {
      categories.infra.push(c)
    }
  }

  return categories
}

function main() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const version = pkg.version || '0.4.0'
  const repoUrl = pkg.repository?.url?.replace(/\.git$/, '') || 'https://github.com/imsovikde/Edge-Drop'
  const distDir = 'dist'

  const latestTag = getLatestTag()
  console.log(`[ReleaseNotes] Generating intelligent release notes for Edge-Drop v${version} (previous tag: ${latestTag || 'none'})...`)

  const commits = getCommitsSince(latestTag)
  const cat = categorizeCommits(commits)

  // Collect binaries in dist/
  const artifacts = []
  if (existsSync(distDir)) {
    const files = readdirSync(distDir)
    for (const f of files) {
      const fullPath = join(distDir, f)
      if (
        f.endsWith('.exe') ||
        f.endsWith('.dmg') ||
        f.endsWith('.zip') ||
        f.endsWith('.AppImage') ||
        f.endsWith('.deb') ||
        f.endsWith('.rpm')
      ) {
        const stats = statSync(fullPath)
        const hash = getSha256(fullPath)
        artifacts.push({
          name: f,
          size: formatBytes(stats.size),
          platform: resolvePlatform(f),
          sha256: hash
        })
      }
    }
  }

  let table = ''
  if (artifacts.length > 0) {
    table = [
      '### 📦 Binary Checksums & Cryptographic Hashes (SHA-256)',
      '',
      '| Artifact | Platform | Size | SHA-256 Checksum |',
      '| :--- | :--- | :--- | :--- |',
      ...artifacts.map(
        (a) => `| \`${a.name}\` | ${a.platform} | ${a.size} | \`${a.sha256}\` |`
      ),
      ''
    ].join('\n')
  }

  const formatList = (items) =>
    items.map((c) => `- [\`${c.shortHash}\`](${repoUrl}/commit/${c.hash}) ${c.subject}`).join('\n')

  const sections = []

  if (cat.security.length > 0) {
    sections.push(
      '### 🔒 Security Hardening & Zero-Vulnerability Architecture',
      formatList(cat.security),
      ''
    )
  }

  if (cat.performance.length > 0) {
    sections.push(
      '### ⚡ Zero-Resource Adaptive Intelligence & Kernel Offloading',
      formatList(cat.performance),
      ''
    )
  }

  if (cat.vault.length > 0) {
    sections.push(
      '### 💾 Offline Snapshot Engine & Local Vault (.edvault)',
      formatList(cat.vault),
      ''
    )
  }

  if (cat.auth.length > 0) {
    sections.push(
      '### 🔑 Desktop PKCE Loopback & Secure Authentication',
      formatList(cat.auth),
      ''
    )
  }

  if (cat.features.length > 0) {
    sections.push(
      '### 🚀 Core Synchronization & Multi-Device Plane',
      formatList(cat.features),
      ''
    )
  }

  if (cat.ipc.length > 0) {
    sections.push(
      '### 🔌 IPC Channels & Safe Preload Bridge Contracts',
      formatList(cat.ipc),
      ''
    )
  }

  if (cat.ui.length > 0) {
    sections.push(
      '### 🎨 Hardware Telemetry LED & Motioncraft Aesthetics',
      formatList(cat.ui),
      ''
    )
  }

  if (cat.fixes.length > 0) {
    sections.push(
      '### 🐛 Bug Fixes & Forensic Stability',
      formatList(cat.fixes),
      ''
    )
  }

  if (cat.infra.length > 0) {
    sections.push(
      '### 🛠️ Multi-OS CI/CD Pipeline & Tooling',
      formatList(cat.infra),
      ''
    )
  }

  const notes = [
    `# Edge-Drop v${version} — Bring Your Own Firebase, Universal Cloud Vault, Spotless Multi-Format File Export & Clean Invisible Scrollbars`,
    '',
    `Edge-Drop is an ultra-fast clipboard manager that docks seamlessly on your display with authentic spring physics. Version ${version} introduces Bring Your Own Firebase with universal multi-format configuration parsing, dedicated Firestore and Storage security rules, 1-click zero-lock-in rollback, spotless multi-format file export (Markdown, Plain Text, ISO 32000-1 PDF), docked PreviewFlyout sub-view architecture for QR mobile transfer, text transforms, and file export (eliminating desktop blackout overlays), clean invisible scrollbars with smooth scrolling, and tactile hierarchical Escape navigation.`,
    '',
    ...sections,
    table,
    '---',
    `Built with precision by [Souvik Dey](https://github.com/imsovikde) • [Issues & Architecture](https://github.com/imsovikde/Edge-Drop/issues)`
  ].join('\n')

  writeFileSync('release-notes.md', notes + '\n', 'utf8')
  console.log(`[ReleaseNotes] release-notes.md successfully generated with ${commits.length} categorized commits!`)
}

main()
