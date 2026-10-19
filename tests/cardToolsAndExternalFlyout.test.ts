import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n')

describe('Card Tools & External Flyout Architecture', () => {
  const clipboardItem = read('src/components/ClipboardItem.tsx')
  const cardToolsMenu = read('src/components/CardToolsMenu.tsx')
  const previewFlyout = read('src/components/PreviewFlyout.tsx')
  const qrModal = read('src/components/QuickMobileModal.tsx')
  const exportModal = read('src/components/ItemExportModal.tsx')
  const transformModal = read('src/components/TransformModal.tsx')
  const itemCss = read('src/styles/item.css')

  it('ClipboardItem card actions are decluttered and use CardToolsMenu', () => {
    // CardToolsMenu is imported and mounted inside .actions
    expect(clipboardItem).toContain("import { CardToolsMenu } from './CardToolsMenu'")
    expect(clipboardItem).toContain('<CardToolsMenu')

    // Crowded 9+ individual buttons are not crammed directly into .actions
    expect(clipboardItem).not.toMatch(/className="actions"[^>]*>[\s\S]*<QrCodeIcon/)
    expect(clipboardItem).not.toMatch(/className="actions"[^>]*>[\s\S]*<ExportFileIcon/)
    expect(clipboardItem).not.toMatch(/className="actions"[^>]*>[\s\S]*<WandIcon/)
  })

  it('CardToolsMenu portals its floating menu to document.body to avoid card clipping', () => {
    expect(cardToolsMenu).toContain("import { createPortal } from 'react-dom'")
    expect(cardToolsMenu).toContain('createPortal(')
    expect(cardToolsMenu).toContain('document.body')
    expect(cardToolsMenu).toContain('card-tools-flyout')
    expect(cardToolsMenu).toContain('QR Code Transfer')
    expect(cardToolsMenu).toContain('Transforms & Hashes')
    expect(cardToolsMenu).toContain('Export Item')
  })

  it('QuickMobileModal portals to document.body so QR code never blows up inside small cards', () => {
    expect(qrModal).toContain("import { createPortal } from 'react-dom'")
    expect(qrModal).toContain('createPortal(')
    expect(qrModal).toContain('document.body')
  })

  it('ItemExportModal portals to document.body so export dialog stays unconstrained', () => {
    expect(exportModal).toContain("import { createPortal } from 'react-dom'")
    expect(exportModal).toContain('createPortal(')
    expect(exportModal).toContain('document.body')
  })

  it('TransformModal portals to document.body so hash/transform modal stays unconstrained', () => {
    expect(transformModal).toContain("import { createPortal } from 'react-dom'")
    expect(transformModal).toContain('createPortal(')
    expect(transformModal).toContain('document.body')
  })

  it('PreviewFlyout provides external power actions outside the box for expanded items', () => {
    // Both plain text TextPreviewAndEditor and URL cards offer QR, Export, and Transform
    expect(previewFlyout).toContain('QrCodeIcon')
    expect(previewFlyout).toContain('ExportFileIcon')
    expect(previewFlyout).toContain('WandIcon')
    expect(previewFlyout).toContain('<QuickMobileModal')
    expect(previewFlyout).toContain('<ItemExportModal')
    expect(previewFlyout).toContain('<TransformModal')
  })

  it('CSS styles for .card-tools-flyout and .card-tools-item are present and fully engineered', () => {
    expect(itemCss).toContain('.card-tools-flyout')
    expect(itemCss).toContain('.card-tools-item')
    expect(itemCss).toContain('.card-tools-icon')
    expect(itemCss).toContain('.card-tools-title')
    expect(itemCss).toContain('.card-tools-desc')
  })
})
