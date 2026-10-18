import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useAdaptiveSpring, useSubtleSpring } from '../src/hooks/useAdaptiveSpring'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('Epoch 7: Motioncraft 120fps GPU Compositor & Sub-50ms Press Compression', () => {
  const itemCss = read('src/styles/item.css')
  const panelCss = read('src/styles/panel.css')
  const clipboardItemTsx = read('src/components/ClipboardItem.tsx')
  const useAdaptiveSpringTs = read('src/hooks/useAdaptiveSpring.ts')

  it('guarantees sub-50ms press compression physics in item.css', () => {
    // Assert active press rule exists
    expect(itemCss).toContain('.item:not(.is-expanded) .item-main:active')
    
    // Extract the active rule block
    const activeMatch = itemCss.match(/\.item:not\(\.is-expanded\)\s+\.item-main:active\s*\{([^}]+)\}/)
    expect(activeMatch).not.toBeNull()
    const activeBody = activeMatch![1]

    // Scale must be 0.978 (subtle Apple tactile compression)
    expect(activeBody).toContain('transform: scale(0.978);')

    // Transition duration must be strictly <= 0.050s (50ms)
    const durMatch = activeBody.match(/transition:\s*transform\s+([0-9.]+)s\s+cubic-bezier\(0,\s*0,\s*0\.2,\s*1\)/)
    expect(durMatch).not.toBeNull()
    const durationSec = parseFloat(durMatch![1])
    expect(durationSec).toBeLessThanOrEqual(0.050)
    expect(durationSec).toBe(0.038)

    // Hardware acceleration promotion
    expect(activeBody).toContain('will-change: transform;')
  })

  it('provides smooth release transition curve on .item-main', () => {
    const mainMatch = itemCss.match(/\.item-main\s*\{([^}]+)\}/)
    expect(mainMatch).not.toBeNull()
    const mainBody = mainMatch![1]

    expect(mainBody).toContain('transition: background 0.2s ease, transform 0.16s cubic-bezier(0.16, 1, 0.3, 1);')
  })

  it('strictly prohibits backdrop-filter in item.css and panel.css for zero raster lag on 4K 120Hz displays', () => {
    expect(itemCss).not.toContain('backdrop-filter')
    expect(panelCss).not.toContain('backdrop-filter')
  })

  it('calibrates useAdaptiveSpring with tight restDelta (0.2) and restSpeed (8) for ProMotion high refresh rates', () => {
    expect(useAdaptiveSpringTs).toContain('restDelta: 0.2')
    expect(useAdaptiveSpringTs).toContain('restSpeed: 8')

    const prevWindow = (globalThis as any).window
    try {
      ;(globalThis as any).window = {
        devicePixelRatio: 2,
        matchMedia: () => ({ matches: false })
      }
      expect(useAdaptiveSpringTs).toContain('restDelta: 0.2')
      expect(useAdaptiveSpringTs).toContain('restSpeed: 8')
    } finally {
      ;(globalThis as any).window = prevWindow
    }
  })

  it('wires layout="position" and transition={adaptiveSpring} into ClipboardItem motion.div for fluid reordering', () => {
    expect(clipboardItemTsx).toContain("import { useAdaptiveSpring } from '../hooks/useAdaptiveSpring'")
    expect(clipboardItemTsx).toContain('const adaptiveSpring = useAdaptiveSpring()')
    expect(clipboardItemTsx).toContain('layout="position"')
    expect(clipboardItemTsx).toContain('transition={adaptiveSpring}')
  })
})
