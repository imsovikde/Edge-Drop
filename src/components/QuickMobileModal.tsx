import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { generateQrSvg, generateQrDataUrl, selectQrVersion } from '../lib/qrCode'
import { CloseIcon, CheckIcon, CopyIcon, QrCodeIcon } from './icons'
import { playButtonClickSound, playCardExpandSound } from '../lib/soundEffects'
import { useTranslation } from '../i18n'

interface QuickMobileModalProps {
  text: string
  isUrl?: boolean
  onClose: () => void
}

export const QuickMobileModal: React.FC<QuickMobileModalProps> = ({ text, isUrl, onClose }) => {
  const { t } = useTranslation()
  const [copiedType, setCopiedType] = useState<'svg' | 'dataUrl' | null>(null)
  const [isClosing, setIsClosing] = useState(false)

  const handleClose = useCallback(() => {
    if (isClosing) return
    setIsClosing(true)
    playCardExpandSound(false)
    setTimeout(() => {
      onClose()
    }, 180)
  }, [isClosing, onClose])

  useEffect(() => {
    playCardExpandSound(true)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleClose])

  const bytes = useMemo(() => new TextEncoder().encode(text), [text])
  const versionInfo = useMemo(() => selectQrVersion(bytes.length), [bytes])

  const qrSvg = useMemo(() => {
    return generateQrSvg(text, {
      size: 196,
      margin: 2,
      darkColor: '#090a0f',
      lightColor: '#ffffff'
    })
  }, [text])

  const copySvg = async () => {
    playButtonClickSound()
    try {
      await navigator.clipboard.writeText(qrSvg)
      setCopiedType('svg')
      setTimeout(() => setCopiedType(null), 1800)
    } catch (err) {
      console.error('Failed to copy SVG', err)
    }
  }

  const copyDataUrl = async () => {
    playButtonClickSound()
    try {
      const dataUrl = generateQrDataUrl(text, {
        size: 256,
        margin: 2,
        darkColor: '#090a0f',
        lightColor: '#ffffff'
      })
      await navigator.clipboard.writeText(dataUrl)
      setCopiedType('dataUrl')
      setTimeout(() => setCopiedType(null), 1800)
    } catch (err) {
      console.error('Failed to copy Data URL', err)
    }
  }

  return createPortal(
    <motion.div
      className="quick-mobile-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: isClosing ? 0 : 1 }}
      transition={{ duration: 0.18, ease: isClosing ? [0.3, 0, 0.2, 1] : [0.16, 1, 0.3, 1] }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation()
          handleClose()
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(10px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <motion.div
        className="quick-mobile-modal-card edge-custom-scrollbar"
        initial={{ opacity: 0, scale: 0.93, y: 12 }}
        animate={{
          opacity: isClosing ? 0 : 1,
          scale: isClosing ? 0.95 : 1,
          y: isClosing ? 8 : 0
        }}
        transition={{
          duration: 0.2,
          ease: isClosing ? [0.3, 0, 0.2, 1] : [0.16, 1, 0.3, 1]
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 340,
          maxHeight: 'min(580px, 90vh)',
          overflowY: 'auto',
          background: 'linear-gradient(180deg, rgba(28, 28, 35, 0.98) 0%, rgba(18, 18, 23, 0.98) 100%)',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65), 0 0 1px 1px rgba(255, 255, 255, 0.08) inset',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          color: '#e4e4e7',
          boxSizing: 'border-box'
        }}
      >
        {/* Header */}
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ color: '#60a5fa', display: 'flex', alignItems: 'center' }}>
              <QrCodeIcon size={16} />
            </span>
            <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: '0.01em', color: '#f4f4f5' }}>
              {isUrl ? 'Mobile Link Transfer' : 'Scan to Mobile'}
            </span>
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'rgba(96, 165, 250, 0.15)',
                border: '1px solid rgba(96, 165, 250, 0.3)',
                color: '#60a5fa',
                fontWeight: 600
              }}
            >
              V{versionInfo.version}
            </span>
          </div>

          <button
            type="button"
            aria-label="Close dialog"
            title={t('header.close') || 'Close (Esc)'}
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

        {/* QR Code Container */}
        <div
          className="qr-matrix-preview"
          style={{
            background: '#ffffff',
            padding: 12,
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 0
          }}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        {/* Device camera guidance badge */}
        <div
          style={{
            fontSize: 11,
            color: '#a1a1aa',
            textAlign: 'center',
            lineHeight: 1.45,
            padding: '0 4px'
          }}
        >
          Point your iPhone Camera or Android Google Lens to beam this to your phone.
        </div>

        {/* Truncated payload text preview */}
        <div
          style={{
            width: '100%',
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '7px 10px',
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
            color: '#93c5fd',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            boxSizing: 'border-box'
          }}
          title={text}
        >
          {text}
        </div>

        {/* Action Buttons */}
        <div style={{ width: '100%', display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={copySvg}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: copiedType === 'svg' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              border: copiedType === 'svg' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 500,
              color: copiedType === 'svg' ? '#34d399' : '#d4d4d8',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {copiedType === 'svg' ? <CheckIcon width={12} height={12} /> : <CopyIcon width={12} height={12} />}
            <span>{copiedType === 'svg' ? 'Copied SVG' : 'Copy SVG'}</span>
          </button>

          <button
            type="button"
            onClick={copyDataUrl}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: copiedType === 'dataUrl' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              border: copiedType === 'dataUrl' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 500,
              color: copiedType === 'dataUrl' ? '#34d399' : '#d4d4d8',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {copiedType === 'dataUrl' ? <CheckIcon width={12} height={12} /> : <QrCodeIcon width={12} height={12} />}
            <span>{copiedType === 'dataUrl' ? 'Copied Data' : 'Data URL'}</span>
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}
