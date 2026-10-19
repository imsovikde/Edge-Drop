import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type { ClipboardItemDto } from '../../shared/types'
import {
  DotsThreeIcon,
  QrCodeIcon,
  WandIcon,
  ExportFileIcon,
  SparklesIcon,
  ExternalLinkIcon
} from './icons'
import { playButtonClickSound, playCopySuccessSound } from '../lib/soundEffects'
import { useStore } from '../store/appStore'

interface CardToolsMenuProps {
  item: ClipboardItemDto
  cleanUrlResult?: { hasTracking: boolean; cleanedUrl: string; removedParams: string[] } | null
  onOpenQr: () => void
  onOpenTransform: () => void
  onOpenExport: () => void
}

export const CardToolsMenu: React.FC<CardToolsMenuProps> = ({
  item,
  cleanUrlResult,
  onOpenQr,
  onOpenTransform,
  onOpenExport
}) => {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    playButtonClickSound()

    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const menuHeight = 220
      const top = spaceBelow < menuHeight ? Math.max(12, rect.top - menuHeight) : rect.bottom + 6
      const right = Math.max(12, window.innerWidth - rect.right)
      setMenuPos({ top, right })
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        btnRef.current &&
        !btnRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const handleCleanCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!cleanUrlResult) return
    playCopySuccessSound()
    setOpen(false)
    try {
      await navigator.clipboard.writeText(cleanUrlResult.cleanedUrl)
      useStore.getState().pushToast({
        id: `clean-url-${Date.now()}`,
        message: `Clean link copied (${cleanUrlResult.removedParams.length} tracker${cleanUrlResult.removedParams.length > 1 ? 's' : ''} removed)`,
        tone: 'info'
      })
    } catch (err) {
      console.error('Failed to copy clean URL', err)
    }
  }

  const handleOpenExternal = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    playButtonClickSound()
    setOpen(false)
    const text = (item.data as any)?.text
    if (text) window.open(text, '_blank')
  }

  return (
    <div className="card-tools-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        type="button"
        className={`act${open ? ' active' : ''}`}
        title="More tools (QR, transforms, export)"
        onClick={toggleMenu}
      >
        <DotsThreeIcon width={13} height={13} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && menuPos && (
            <motion.div
              ref={menuRef}
              className="card-tools-flyout"
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -4 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
              }}
              style={{
                position: 'fixed',
                top: menuPos.top,
                right: menuPos.right,
                zIndex: 99999,
                width: 220,
                background: 'rgba(24, 24, 28, 0.98)',
                backdropFilter: 'blur(16px)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.14)',
                boxShadow: '0 16px 40px rgba(0, 0, 0, 0.75), 0 0 1px 1px rgba(255, 255, 255, 0.08) inset',
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
            >
              {/* Header */}
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.45)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '4px 8px 3px'
                }}
              >
                Power Tools
              </div>

              {/* QR Code Action */}
              <button
                type="button"
                className="card-tools-item"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  playButtonClickSound()
                  setOpen(false)
                  onOpenQr()
                }}
              >
                <span className="card-tools-icon" style={{ color: '#60a5fa' }}>
                  <QrCodeIcon width={14} height={14} />
                </span>
                <div className="card-tools-text">
                  <span className="card-tools-title">QR Code Transfer</span>
                  <span className="card-tools-desc">Scan to mobile phone</span>
                </div>
              </button>

              {/* Transform & Hashes Action */}
              <button
                type="button"
                className="card-tools-item"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  playButtonClickSound()
                  setOpen(false)
                  onOpenTransform()
                }}
              >
                <span className="card-tools-icon" style={{ color: '#f59e0b' }}>
                  <WandIcon width={14} height={14} />
                </span>
                <div className="card-tools-text">
                  <span className="card-tools-title">Transforms & Hashes</span>
                  <span className="card-tools-desc">SHA-256, CRC32, cases</span>
                </div>
              </button>

              {/* Spotless Export Action */}
              <button
                type="button"
                className="card-tools-item"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  playButtonClickSound()
                  setOpen(false)
                  onOpenExport()
                }}
              >
                <span className="card-tools-icon" style={{ color: '#10b981' }}>
                  <ExportFileIcon width={14} height={14} />
                </span>
                <div className="card-tools-text">
                  <span className="card-tools-title">Export Item</span>
                  <span className="card-tools-desc">Markdown, TXT, PDF</span>
                </div>
              </button>

              {/* Clean link action if trackers detected */}
              {cleanUrlResult?.hasTracking && (
                <button
                  type="button"
                  className="card-tools-item"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleCleanCopy}
                >
                  <span className="card-tools-icon" style={{ color: '#ec4899' }}>
                    <SparklesIcon width={14} height={14} />
                  </span>
                  <div className="card-tools-text">
                    <span className="card-tools-title">Copy Clean Link</span>
                    <span className="card-tools-desc">
                      Remove {cleanUrlResult.removedParams.length} tracker{cleanUrlResult.removedParams.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
              )}

              {/* Open External Link action if URL */}
              {item.data.kind === 'text' && item.data.isUrl && (
                <button
                  type="button"
                  className="card-tools-item"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleOpenExternal}
                >
                  <span className="card-tools-icon" style={{ color: '#a78bfa' }}>
                    <ExternalLinkIcon width={14} height={14} />
                  </span>
                  <div className="card-tools-text">
                    <span className="card-tools-title">Open in Browser</span>
                    <span className="card-tools-desc">Launch default browser</span>
                  </div>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
