import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { ClipboardItemDto } from '../../shared/types'
import {
  exportSingleItem,
  generateExportFilename,
  getItemRawText
} from '../lib/singleItemExport'
import { calculateTextMetrics } from '../lib/format'
import { detectCode } from '../lib/codeDetect'
import { CloseIcon, CheckIcon, ExportFileIcon } from './icons'
import { playCardExpandSound, playCopySuccessSound } from '../lib/soundEffects'
import { useStore } from '../store/appStore'

interface ItemExportModalProps {
  item: ClipboardItemDto
  onClose: () => void
  onBack?: () => void
}

export const ItemExportModal: React.FC<ItemExportModalProps> = ({ item, onClose, onBack }) => {
  const [downloadingFormat, setDownloadingFormat] = useState<'md' | 'txt' | 'pdf' | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const pushToast = useStore((s) => s.pushToast)

  const rawText = getItemRawText(item)
  const metrics = calculateTextMetrics(rawText)
  const lineCount = rawText ? rawText.split('\n').length : 0
  const codeInfo = detectCode(rawText)

  const mdFilename = generateExportFilename(item, 'md')
  const txtFilename = generateExportFilename(item, 'txt')
  const pdfFilename = generateExportFilename(item, 'pdf')

  const handleClose = useCallback(() => {
    if (isClosing) return
    setIsClosing(true)
    playCardExpandSound(false)
    setTimeout(() => {
      onClose()
    }, 50)
  }, [isClosing, onClose])

  useEffect(() => {
    playCardExpandSound(true)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        if (onBack) {
          onBack()
        } else {
          handleClose()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleClose, onBack])

  const handleExport = async (format: 'md' | 'txt' | 'pdf') => {
    playCopySuccessSound()
    setDownloadingFormat(format)
    try {
      const res = await exportSingleItem(item, format)
      if (res.success) {
        pushToast({
          id: `export-${Date.now()}`,
          message: `Saved spotless export: ${res.filename}`,
          tone: 'info'
        })
      }
    } catch (err) {
      console.error('Failed to export item', err)
      pushToast({
        id: `export-err-${Date.now()}`,
        message: 'Failed to generate export file',
        tone: 'error'
      })
    } finally {
      setTimeout(() => setDownloadingFormat(null), 1400)
    }
  }

  return (
    <motion.div
      className="item-export-modal"
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{
        opacity: isClosing ? 0 : 1,
        scale: isClosing ? 0.97 : 1,
        y: isClosing ? 6 : 0
      }}
      transition={{
        duration: 0.2,
        ease: isClosing ? [0.3, 0, 0.2, 1] : [0.16, 1, 0.3, 1]
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#f4f4f5',
        fontFamily: 'inherit'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onBack && (
            <button
              type="button"
              className="act"
              title="Back to Preview"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onBack()
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 6,
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d4d4d8',
                cursor: 'pointer',
                marginRight: 2
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.18)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8'
            }}
          >
            <ExportFileIcon size={15} />
          </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>Export Item</div>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)' }}>
                Spotless lossless export to Markdown, Plain Text, or PDF
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            title="Close (Esc)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              handleClose()
            }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#d4d4d8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'all 0.15s ease',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)'
              e.currentTarget.style.color = '#ffffff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
              e.currentTarget.style.color = '#d4d4d8'
            }}
          >
            <CloseIcon width={14} height={14} style={{ pointerEvents: 'none' }} />
          </button>
        </div>

        {/* Telemetry Strip */}
        <div
          style={{
            padding: '10px 16px',
            background: 'rgba(0, 0, 0, 0.35)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.65)'
          }}
        >
          <span>
            <strong style={{ color: '#ffffff' }}>{metrics.chars}</strong> chars
          </span>
          <span>•</span>
          <span>
            <strong style={{ color: '#ffffff' }}>{metrics.words}</strong> words
          </span>
          <span>•</span>
          <span>
            <strong style={{ color: '#ffffff' }}>{lineCount}</strong> lines
          </span>
          {codeInfo.isCode && (
            <>
              <span>•</span>
              <span
                style={{
                  background: 'rgba(99, 102, 241, 0.16)',
                  color: '#818cf8',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: 10
                }}
              >
                {codeInfo.language.toUpperCase()}
              </span>
            </>
          )}
        </div>

        {/* Format Selection Cards */}
        <div
          className="edge-custom-scrollbar"
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            overflowY: 'auto',
            maxHeight: 'min(420px, 55vh)',
            overscrollBehavior: 'contain'
          }}
        >
          {/* Option 1: Markdown */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              transition: 'background 0.14s ease'
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#ffffff' }}>Markdown (.md)</span>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    fontSize: 9.5,
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontWeight: 600
                  }}
                >
                  STRUCTURED
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.52)', marginTop: 2 }}>
                Includes captured timestamp, character metrics, and syntax code fences
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(255, 255, 255, 0.35)',
                  fontFamily: 'monospace',
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {mdFilename}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleExport('md')}
              disabled={downloadingFormat === 'md'}
              style={{
                background: downloadingFormat === 'md' ? '#10b981' : 'rgba(99, 102, 241, 0.22)',
                border: downloadingFormat === 'md' ? '1px solid #10b981' : '1px solid rgba(99, 102, 241, 0.45)',
                color: '#ffffff',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                transition: 'all 0.14s ease'
              }}
            >
              {downloadingFormat === 'md' ? (
                <>
                  <CheckIcon size={12} />
                  <span>Saved</span>
                </>
              ) : (
                <span>Export .MD</span>
              )}
            </button>
          </div>

          {/* Option 2: Plain Text */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              transition: 'background 0.14s ease'
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#ffffff' }}>Plain Text (.txt)</span>
                <span
                  style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    fontSize: 9.5,
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontWeight: 600
                  }}
                >
                  VERBATIM
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.52)', marginTop: 2 }}>
                100% unadulterated raw text, preserving all indentation, spaces, and line breaks
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(255, 255, 255, 0.35)',
                  fontFamily: 'monospace',
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {txtFilename}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleExport('txt')}
              disabled={downloadingFormat === 'txt'}
              style={{
                background: downloadingFormat === 'txt' ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                border: downloadingFormat === 'txt' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.18)',
                color: '#ffffff',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                transition: 'all 0.14s ease'
              }}
            >
              {downloadingFormat === 'txt' ? (
                <>
                  <CheckIcon size={12} />
                  <span>Saved</span>
                </>
              ) : (
                <span>Export .TXT</span>
              )}
            </button>
          </div>

          {/* Option 3: PDF Document */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              transition: 'background 0.14s ease'
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#ffffff' }}>PDF Document (.pdf)</span>
                <span
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    fontSize: 9.5,
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontWeight: 600
                  }}
                >
                  VECTOR PDF
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.52)', marginTop: 2 }}>
                ISO 32000-1 vector document with branded header, metadata pill, and page numbers
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(255, 255, 255, 0.35)',
                  fontFamily: 'monospace',
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {pdfFilename}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={downloadingFormat === 'pdf'}
              style={{
                background: downloadingFormat === 'pdf' ? '#10b981' : 'rgba(239, 68, 68, 0.22)',
                border: downloadingFormat === 'pdf' ? '1px solid #10b981' : '1px solid rgba(239, 68, 68, 0.45)',
                color: '#ffffff',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                transition: 'all 0.14s ease'
              }}
            >
              {downloadingFormat === 'pdf' ? (
                <>
                  <CheckIcon size={12} />
                  <span>Saved</span>
                </>
              ) : (
                <span>Export .PDF</span>
              )}
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.015)',
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.4)'
          }}
        >
          <span>Press ESC to exit</span>
          <span>Zero-loss character preservation</span>
        </div>
      </motion.div>
    )
  }
