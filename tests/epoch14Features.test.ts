import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Epoch 14 Features: Pinned Sync, Top Dock Stability & Network Timeout Resilience', () => {
  it('ensures .list.horizontal CSS enforces max-content width and no flex shrinking on sections', () => {
    const cssPath = join(process.cwd(), 'src/styles/panel.css')
    const css = readFileSync(cssPath, 'utf8')

    // Verify .list.horizontal .list-stack has min-width: max-content
    expect(css).toMatch(/\.list\.horizontal\s+\.list-stack[\s\S]*?min-width:\s*max-content/i)
    // Verify .list.horizontal .pinned-section has min-width: max-content and flex-shrink: 0
    expect(css).toMatch(/\.list\.horizontal\s+\.pinned-section[\s\S]*?min-width:\s*max-content/i)
    expect(css).toMatch(/\.list\.horizontal\s+\.pinned-section[\s\S]*?flex-shrink:\s*0/i)
    // Verify .list.horizontal .recent-section has min-width: max-content and flex-shrink: 0
    expect(css).toMatch(/\.list\.horizontal\s+\.recent-section[\s\S]*?min-width:\s*max-content/i)
    expect(css).toMatch(/\.list\.horizontal\s+\.recent-section[\s\S]*?flex-shrink:\s*0/i)
  })

  it('verifies syncEngine includes pinned, tags, and colorTag in serialized Firestore documents', () => {
    const syncEnginePath = join(process.cwd(), 'electron/backup/syncEngine.ts')
    const code = readFileSync(syncEnginePath, 'utf8')

    // Document creation must include pinned, tags, and colorTag
    expect(code).toContain('pinned: entry.item.pinned')
    expect(code).toContain('tags: entry.item.tags')
    expect(code).toContain('colorTag: entry.item.colorTag')
  })

  it('verifies syncEngine restores pinned, tags, and colorTag when ingesting remote items', () => {
    const syncEnginePath = join(process.cwd(), 'electron/backup/syncEngine.ts')
    const code = readFileSync(syncEnginePath, 'utf8')

    expect(code).toMatch(/pinned:\s*!!data\.pinned/)
    expect(code).toMatch(/tags:\s*(?:Array\.isArray\(data\.tags\)\s*\?\s*data\.tags\s*:\s*undefined|data\.tags)/)
    expect(code).toMatch(/colorTag:\s*(?:data\.colorTag\s*\|\|\s*undefined|data\.colorTag)/)
  })

  it('ensures fetchFirestore uses a resilient network timeout signal to prevent indefinite hang', () => {
    const syncEnginePath = join(process.cwd(), 'electron/backup/syncEngine.ts')
    const code = readFileSync(syncEnginePath, 'utf8')

    expect(code).toMatch(/signal:.*timeout/i)
  })

  it('guards popUpAndRetract in ipc.ts so in-app settings switches do not prematurely close', () => {
    const ipcPath = join(process.cwd(), 'electron/main/ipc.ts')
    const code = readFileSync(ipcPath, 'utf8')

    // Must check if interactive is false before invoking popUpAndRetract
    expect(code).toMatch(/if\s*\(!interactive\)\s*\{\s*popUpAndRetract\(1500\)\s*\}/)
  })
})
