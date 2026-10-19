import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
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
    <div
      className="quick-mobile-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          playCardExpandSound(false)
          onClose()
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
        padding: 16,
        animation: 'fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <div
        className="quick-mobile-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 340,
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
            className="act"
            onClick={() => {
              playCardExpandSound(false)
              onClose()
            }}
            title={t('header.close') || 'Close'}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: 6,
              padding: 4,
              color: '#a1a1aa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
          >
            <CloseIcon width={14} height={14} />
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
      </div>
    </div>,
    document.body
  )
}
