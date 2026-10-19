import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ClipboardItemDto } from '../../shared/types'
import {
  exportSingleItem,
  generateExportFilename,
  getItemRawText
} from '../lib/singleItemExport'
import { calculateTextMetrics } from '../lib/format'
import { detectCode } from '../lib/codeDetect'
import { CloseIcon, CheckIcon, ExportFileIcon } from './icons'
import { playButtonClickSound, playCardExpandSound, playCopySuccessSound } from '../lib/soundEffects'
import { useStore } from '../store/appStore'

interface ItemExportModalProps {
  item: ClipboardItemDto
  onClose: () => void
}

export const ItemExportModal: React.FC<ItemExportModalProps> = ({ item, onClose }) => {
  const [downloadingFormat, setDownloadingFormat] = useState<'md' | 'txt' | 'pdf' | null>(null)
  const pushToast = useStore((s) => s.pushToast)

  const rawText = getItemRawText(item)
  const metrics = calculateTextMetrics(rawText)
  const lineCount = rawText ? rawText.split('\n').length : 0
  const codeInfo = detectCode(rawText)

  const mdFilename = generateExportFilename(item, 'md')
  const txtFilename = generateExportFilename(item, 'txt')
  const pdfFilename = generateExportFilename(item, 'pdf')

  useEffect(() => {
    playCardExpandSound(true)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        playCardExpandSound(false)
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

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

  return createPortal(
    <div
      className="item-export-modal-backdrop"
      onClick={() => {
        playCardExpandSound(false)
        onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div
        className="item-export-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'rgba(20, 20, 24, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 1px 1px rgba(255, 255, 255, 0.08) inset',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f4f4f5',
          fontFamily: 'inherit',
          animation: 'scaleIn 0.16s cubic-bezier(0.16, 1, 0.3, 1)'
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
            onClick={() => {
              playButtonClickSound()
              onClose()
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.55)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <CloseIcon size={14} />
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
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
      </div>
    </div>,
    document.body
  )
}
