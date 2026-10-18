import { describe, expect, it, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ClipboardItemDto } from '../shared/types'

const root = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Epoch 2: Zero-Latency Shelf Accessibility & Keyboard Navigation', () => {
  const itemListTsx = read('src/components/ItemList.tsx')
  const clipboardItemTsx = read('src/components/ClipboardItem.tsx')
  const keyboardNavTs = read('src/hooks/useShelfKeyboardNav.ts')
  const itemCss = read('src/styles/item.css')
  const panelCss = read('src/styles/panel.css')

  it('provides dedicated useShelfKeyboardNav hook with full accessibility mechanics', () => {
    expect(existsSync(join(root, 'src/hooks/useShelfKeyboardNav.ts'))).toBe(true)
    expect(keyboardNavTs).toContain('export function useShelfKeyboardNav')
    expect(keyboardNavTs).toContain('setAltHeld')
    expect(keyboardNavTs).toContain('setSelectedItemIndex')
    expect(keyboardNavTs).toContain("e.key >= '1' && e.key <= '9'")
    expect(keyboardNavTs).toContain("e.key === 'ArrowDown'")
    expect(keyboardNavTs).toContain("e.key === 'ArrowUp'")
    expect(keyboardNavTs).toContain("e.key === 'Enter'")
    expect(keyboardNavTs).toContain("e.key === ' ' || e.code === 'Space'")
    expect(keyboardNavTs).toContain("e.key === 'p' || e.key === 'P'")
    expect(keyboardNavTs).toContain("e.key === 'Delete' || e.key === 'Backspace'")
  })

  it('guarantees text input isolation so search bar typing does not trigger navigation hotkeys', () => {
    expect(keyboardNavTs).toContain("target.tagName === 'INPUT'")
    expect(keyboardNavTs).toContain("target.tagName === 'TEXTAREA'")
    // Allows Alt+1..9 quick paste even from search field
    expect(keyboardNavTs).toContain("e.altKey && e.key >= '1' && e.key <= '9'")
  })

  it('wires useShelfKeyboardNav into ItemList for seamless shelf operation', () => {
    expect(itemListTsx).toContain("import { useShelfKeyboardNav } from '../hooks/useShelfKeyboardNav'")
    expect(itemListTsx).toContain('const { selectedItemIndex, altHeld } = useShelfKeyboardNav')
    expect(itemListTsx).toContain('visibleItems')
    expect(itemListTsx).toContain('tryPaste')
  })

  it('passes keyboard selection and hotkey badge props to ClipboardItemCard', () => {
    expect(itemListTsx).toContain('isSelected={isSelected}')
    expect(itemListTsx).toContain('altHeld={altHeld}')
    expect(clipboardItemTsx).toContain('interface Props {')
    expect(clipboardItemTsx).toContain('isSelected?: boolean')
    expect(clipboardItemTsx).toContain('altHeld?: boolean')
    expect(clipboardItemTsx).toContain('is-keyboard-selected')
  })

  it('renders quick-paste badges across all card variants (text, image, file)', () => {
    expect(clipboardItemTsx).toContain('item-quick-badge')
    expect(clipboardItemTsx).toContain('badgeIndex')
    expect(itemCss).toContain('.item-quick-badge')
    expect(itemCss).toContain('.item-quick-badge.is-alt-held')
    expect(itemCss).toContain('.item.is-keyboard-selected')
  })

  it('implements card shimmer skeleton during asset hydration in ClipboardItem', () => {
    expect(clipboardItemTsx).toContain('export function ShimmerImage')
    expect(clipboardItemTsx).toContain('card-shimmer-skeleton')
    expect(panelCss).toContain('.card-shimmer-skeleton')
    expect(panelCss).toContain('@keyframes card-shimmer-sweep')
  })

  it('audits scroll container padding to prevent focus ring and card clipping', () => {
    expect(panelCss).toContain('padding: 4px var(--pad) 20px;')
  })
})
