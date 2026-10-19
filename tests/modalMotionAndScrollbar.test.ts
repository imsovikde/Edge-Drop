import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n')

describe('Modal Motion Engineering, Close Buttons & Draggable Scrollbars', () => {
  const qrModal = read('src/components/QuickMobileModal.tsx')
  const exportModal = read('src/components/ItemExportModal.tsx')
  const transformModal = read('src/components/TransformModal.tsx')
  const cardToolsMenu = read('src/components/CardToolsMenu.tsx')
  const previewFlyout = read('src/components/PreviewFlyout.tsx')
  const iconsTsx = read('src/components/icons.tsx')
  const globalCss = read('src/styles/global.css')
  const itemCss = read('src/styles/item.css')

  it('uiIcon helper correctly honors size prop without falling back', () => {
    expect(iconsTsx).toContain('const size = Number(p.size ?? p.width ?? p.height ?? fallback)')
  })

  it('QuickMobileModal has Framer Motion enter and exit transitions, tactile close button, and scrollbars', () => {
    // Framer motion integration
    expect(qrModal).toContain("import { motion } from 'framer-motion'")
    expect(qrModal).toContain('<motion.div')
    expect(qrModal).toContain('</motion.div>')

    // Exit transition handling
    expect(qrModal).toContain('const [isClosing, setIsClosing] = useState(false)')
    expect(qrModal).toContain('handleClose')
    expect(qrModal).toContain('setTimeout')

    // Escape listener and backdrop pointer handling
    expect(qrModal).toContain("if (e.key === 'Escape')")
    expect(qrModal).toContain('onPointerDown')

    // Tactile close button with stopPropagation and handleClose
    expect(qrModal).toMatch(/<button[\s\S]*?aria-label="Close dialog"[\s\S]*?onPointerDown=/)
    expect(qrModal).toContain('handleClose()')

    // Custom scrollbar
    expect(qrModal).toContain('edge-custom-scrollbar')
    expect(qrModal).toContain('overflowY')
  })

  it('ItemExportModal has Framer Motion enter and exit transitions, tactile close button, and scrollbars', () => {
    expect(exportModal).toContain("import { motion } from 'framer-motion'")
    expect(exportModal).toContain('<motion.div')
    expect(exportModal).toContain('</motion.div>')

    // Exit transition handling
    expect(exportModal).toContain('const [isClosing, setIsClosing] = useState(false)')
    expect(exportModal).toContain('handleClose')

    // Tactile close button
    expect(exportModal).toMatch(/<button[\s\S]*?aria-label="Close dialog"[\s\S]*?onPointerDown=/)
    expect(exportModal).toContain('handleClose()')

    // Custom scrollbar on format cards
    expect(exportModal).toContain('edge-custom-scrollbar')
    expect(exportModal).toContain('overflowY: \'auto\'')
  })

  it('TransformModal has Framer Motion enter and exit transitions, tactile close button, and scrollbars', () => {
    expect(transformModal).toContain("import { motion } from 'framer-motion'")
    expect(transformModal).toContain('<motion.div')
    expect(transformModal).toContain('</motion.div>')

    // Exit transition handling
    expect(transformModal).toContain('const [isClosing, setIsClosing] = useState(false)')
    expect(transformModal).toContain('handleClose')

    // Tactile close button
    expect(transformModal).toMatch(/<button[\s\S]*?aria-label="Close dialog"[\s\S]*?onPointerDown=/)
    expect(transformModal).toContain('handleClose()')

    // Custom scrollbar on transform list
    expect(transformModal).toContain('edge-custom-scrollbar')
    expect(transformModal).toContain('overflowY: \'auto\'')
  })

  it('PreviewFlyout content is scrollable with edge-custom-scrollbar and has dedicated close buttons', () => {
    expect(previewFlyout).toContain('edge-custom-scrollbar')
    expect(previewFlyout).not.toContain("scrollbarWidth: 'none'")
    // Action pills contain close buttons
    expect(previewFlyout).toContain("title={t('header.close') || 'Close preview (Esc)'}")
    expect(previewFlyout).toContain('setPreviewItemId(null)')
    // Escape key listener for clean keyboard dismissal
    expect(previewFlyout).toContain("if (e.key === 'Escape')")
    // Transform dropdown animated with AnimatePresence and custom scrollbar
    expect(previewFlyout).toContain('transform-dropdown-list edge-custom-scrollbar')
  })

  it('CardToolsMenu uses AnimatePresence and motion.div for floating popover', () => {
    expect(cardToolsMenu).toContain("import { motion, AnimatePresence } from 'framer-motion'")
    expect(cardToolsMenu).toContain('<AnimatePresence>')
    expect(cardToolsMenu).toContain('<motion.div')
    expect(cardToolsMenu).toContain('onPointerDown=')
  })

  it('LanguageFlyout and IndicatorStyleFlyout close buttons protect against pointer hijacking', () => {
    const langFlyout = read('src/components/LanguageFlyout.tsx')
    const indicatorFlyout = read('src/components/IndicatorStyleFlyout.tsx')

    expect(langFlyout).toContain('onPointerDown={(e) => e.stopPropagation()}')
    expect(langFlyout).toContain('edge-custom-scrollbar')
    expect(langFlyout).not.toContain("scrollbarWidth: 'none'")

    expect(indicatorFlyout).toContain('onPointerDown={(e) => e.stopPropagation()}')
  })

  it('CSS files define .edge-custom-scrollbar and keyframe animations', () => {
    const panelCss = read('src/styles/panel.css')
    expect(globalCss).toContain('.edge-custom-scrollbar')
    expect(globalCss).toContain('.edge-custom-scrollbar::-webkit-scrollbar')
    expect(globalCss).toContain('@keyframes scaleIn')
    expect(globalCss).toContain('@keyframes scaleOut')
    expect(globalCss).toContain('@keyframes fadeIn')
    expect(globalCss).toContain('@keyframes fadeOut')

    expect(itemCss).toContain('.edge-custom-scrollbar')
    expect(itemCss).toContain('.edge-custom-scrollbar::-webkit-scrollbar')

    // Transform dropdown does not suppress scrollbar
    expect(panelCss).not.toMatch(/\.transform-dropdown-list\s*\{[^}]*scrollbar-width:\s*none/)
  })
})
