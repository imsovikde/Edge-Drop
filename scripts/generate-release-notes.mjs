#!/usr/bin/env node
/**
 * Semantic Release Notes & SHA-256 Binary Integrity Generator for Edge-Drop.
 *
 * Scans build outputs in dist/, computes cryptographically secure SHA-256 hashes,
 * and formats an authentic Staff-Engineer release document for GitHub Releases.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

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

function main() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const version = pkg.version || '0.3.3'
  const distDir = 'dist'

  console.log(`[ReleaseNotes] Generating release notes for Edge-Drop v${version}...`)

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
      '### 📦 Binary Checksums (SHA-256)',
      '',
      '| Artifact | Platform | Size | SHA-256 Checksum |',
      '| :--- | :--- | :--- | :--- |',
      ...artifacts.map(
        (a) => `| \`${a.name}\` | ${a.platform} | ${a.size} | \`${a.sha256}\` |`
      ),
      ''
    ].join('\n')
  }

  const notes = [
    `# Edge-Drop v${version} — Multi-Platform Cloud-Backed Release`,
    '',
    'Edge-Drop is an ultra-fast clipboard manager that lives unobtrusively on the edge of your screen with tactile spring physics, now featuring enterprise-grade Firebase cloud persistence and multi-device real-time sync.',
    '',
    '### 🚀 What\'s New in this Release',
    '- **Split-Plane Firebase Cloud Backup**: Text, formatted HTML, links, colors, full-resolution images, and file stacks are backed up to Firestore and Google Cloud Storage.',
    '- **Desktop PKCE Authentication**: Native Google Sign-In with loopback 127.0.0.1 browser handshake, Email/Password auth, and Anonymous Guest mode.',
    '- **Offline-First Journal**: Zero network blocking or latency hitches; edits and clips queue locally and sync whenever connectivity restores.',
    '- **Pre-Wipe Forensic Recovery**: Automatic startup scanner restores surviving clipboard history into the cloud vault.',
    '- **Bring-Your-Own Firebase**: Option to provide custom Firebase configurations encrypted at rest via DPAPI.',
    '- **Cross-Platform Compilation**: Native builds engineered for Windows, macOS (universal), and Linux.',
    '',
    table,
    '---',
    'Built with ❤️ by [Souvik Dey](https://github.com/imsovikde) • [Issues & Feedback](https://github.com/imsovikde/Edge-Drop/issues)'
  ].join('\n')

  writeFileSync('release-notes.md', notes + '\n', 'utf8')
  console.log('[ReleaseNotes] release-notes.md successfully generated!')
}

main()
