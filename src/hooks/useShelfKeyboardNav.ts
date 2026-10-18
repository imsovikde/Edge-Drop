import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store/appStore'
import type { ClipboardItemDto } from '../../shared/types'

interface UseShelfKeyboardNavOptions {
  visibleItems: ClipboardItemDto[]
  isHorizontal: boolean
  onPaste: (id: string) => void
  onTogglePin: (id: string, pinned: boolean) => void
  onRemove: (id: string) => void
  open: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
}

export interface UseShelfKeyboardNavResult {
  selectedItemIndex: number
  setSelectedItemIndex: React.Dispatch<React.SetStateAction<number>>
  altHeld: boolean
}

export function useShelfKeyboardNav({
  visibleItems,
  isHorizontal,
  onPaste,
  onTogglePin,
  onRemove,
  open,
  containerRef
}: UseShelfKeyboardNavOptions): UseShelfKeyboardNavResult {
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1)
  const [altHeld, setAltHeld] = useState<boolean>(false)

  // Keep fresh references for event handlers without tearing down listeners
  const visibleItemsRef = useRef(visibleItems)
  visibleItemsRef.current = visibleItems

  const selectedIndexRef = useRef(selectedItemIndex)
  selectedIndexRef.current = selectedItemIndex

  const isHorizontalRef = useRef(isHorizontal)
  isHorizontalRef.current = isHorizontal

  const onPasteRef = useRef(onPaste)
  onPasteRef.current = onPaste

  const onTogglePinRef = useRef(onTogglePin)
  onTogglePinRef.current = onTogglePin

  const onRemoveRef = useRef(onRemove)
  onRemoveRef.current = onRemove

  // Reset selection and Alt state when shelf closes
  useEffect(() => {
    if (!open) {
      setSelectedItemIndex(-1)
      setAltHeld(false)
    }
  }, [open])

  // Clamp selectedItemIndex if visible items shrink
  useEffect(() => {
    if (visibleItems.length === 0) {
      if (selectedItemIndex !== -1) setSelectedItemIndex(-1)
    } else if (selectedItemIndex >= visibleItems.length) {
      setSelectedItemIndex(visibleItems.length - 1)
    }
  }, [visibleItems.length, selectedItemIndex])

  // Smoothly scroll selected card into viewport
  useEffect(() => {
    if (selectedItemIndex < 0 || selectedItemIndex >= visibleItems.length) return
    const targetItem = visibleItems[selectedItemIndex]
    if (!targetItem || !containerRef.current) return

    const card = containerRef.current.querySelector(`[data-id="${targetItem.id}"]`) as HTMLElement | null
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth'
      })
    }
  }, [selectedItemIndex, visibleItems, containerRef])

  // Master keyboard listener
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Track Alt key for visual badges
      if (e.key === 'Alt') {
        setAltHeld(true)
      }

      // Check if user is typing in a text field
      const target = e.target as HTMLElement | null
      const isInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )

      // Allow Alt+1..9 quick-paste even from inside search bar
      if (isInput) {
        if (e.altKey && e.key >= '1' && e.key <= '9') {
          const num = parseInt(e.key, 10)
          const item = visibleItemsRef.current[num - 1]
          if (item) {
            e.preventDefault()
            e.stopPropagation()
            onPasteRef.current(item.id)
          }
        }
        return
      }

      // If settings sheet or modal is open, let settings own its hotkeys
      if (useStore.getState().settingsOpen) return

      // 2. Direct 1..9 or Alt+1..9 quick paste
      if (e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key, 10)
        const item = visibleItemsRef.current[num - 1]
        if (item) {
          e.preventDefault()
          e.stopPropagation()
          onPasteRef.current(item.id)
          return
        }
      }

      const total = visibleItemsRef.current.length
      if (total === 0) return

      // 3. Arrow navigation
      const isNext = isHorizontalRef.current ? e.key === 'ArrowRight' : e.key === 'ArrowDown'
      const isPrev = isHorizontalRef.current ? e.key === 'ArrowLeft' : e.key === 'ArrowUp'

      if (isNext) {
        e.preventDefault()
        e.stopPropagation()
        setSelectedItemIndex((prev) => {
          if (prev === -1 || prev >= total - 1) return 0
          return prev + 1
        })
        return
      }

      if (isPrev) {
        e.preventDefault()
        e.stopPropagation()
        setSelectedItemIndex((prev) => {
          if (prev <= 0) return total - 1
          return prev - 1
        })
        return
      }

      // 4. Enter -> paste selected item
      if (e.key === 'Enter') {
        const idx = selectedIndexRef.current
        if (idx >= 0 && idx < total) {
          e.preventDefault()
          e.stopPropagation()
          const item = visibleItemsRef.current[idx]
          if (item) onPasteRef.current(item.id)
        }
        return
      }

      // 5. Space -> toggle preview flyout
      if (e.key === ' ' || e.code === 'Space') {
        const idx = selectedIndexRef.current
        if (idx >= 0 && idx < total) {
          e.preventDefault()
          e.stopPropagation()
          const item = visibleItemsRef.current[idx]
          if (item) {
            const card = containerRef.current?.querySelector(`[data-id="${item.id}"]`) as HTMLElement | null
            const rect = card?.getBoundingClientRect()
            const store = useStore.getState()
            if (store.previewItemId === item.id) {
              store.setPreviewItemId(null)
            } else {
              store.setPreviewItemId(item.id, rect ? {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              } : undefined)
            }
          }
        }
        return
      }

      // 6. 'p' or 'P' -> toggle pin/unpin
      if (e.key === 'p' || e.key === 'P') {
        const idx = selectedIndexRef.current
        if (idx >= 0 && idx < total) {
          e.preventDefault()
          e.stopPropagation()
          const item = visibleItemsRef.current[idx]
          if (item) {
            onTogglePinRef.current(item.id, !item.pinned)
          }
        }
        return
      }

      // 7. Delete or Backspace -> remove item
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const idx = selectedIndexRef.current
        if (idx >= 0 && idx < total) {
          e.preventDefault()
          e.stopPropagation()
          const item = visibleItemsRef.current[idx]
          if (item) {
            onRemoveRef.current(item.id)
          }
        }
        return
      }

      // 8. Escape -> hierarchy collapse
      if (e.key === 'Escape') {
        const store = useStore.getState()
        if (store.previewItemId) {
          e.preventDefault()
          e.stopPropagation()
          store.setPreviewItemId(null)
        } else if (store.expandedStackId) {
          e.preventDefault()
          e.stopPropagation()
          store.setExpandedStackId(null)
        } else if (selectedIndexRef.current !== -1) {
          e.preventDefault()
          e.stopPropagation()
          setSelectedItemIndex(-1)
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setAltHeld(false)
      }
    }

    const handleBlur = () => {
      setAltHeld(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [open, containerRef])

  return {
    selectedItemIndex,
    setSelectedItemIndex,
    altHeld
  }
}
