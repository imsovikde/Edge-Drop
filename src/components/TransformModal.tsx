import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TRANSFORMS,
  applyTransform,
  computeSha256,
  computeCrc32
} from '../lib/textTransforms'
import { CloseIcon, CheckIcon, CopyIcon, WandIcon } from './icons'
import { playButtonClickSound, playCardExpandSound, playCopySuccessSound } from '../lib/soundEffects'
import { useStore } from '../store/appStore'

interface TransformModalProps {
  itemId: string
  text: string
  onClose: () => void
  onBack?: () => void
  onApplyText?: (newText: string) => void
}

export const TransformModal: React.FC<TransformModalProps> = ({
  text,
  onClose,
  onBack,
  onApplyText
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'case' | 'encoding' | 'json' | 'clean'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedHash, setCopiedHash] = useState(false)
  const [sha256, setSha256] = useState<string>('')
  const [isClosing, setIsClosing] = useState(false)

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
    let mounted = true
    computeSha256(text).then((hash) => {
      if (mounted) setSha256(hash)
    })

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
    return () => {
      mounted = false
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [text, handleClose, onBack])

  const crc32 = useMemo(() => computeCrc32(text), [text])

  const filteredTransforms = useMemo(() => {
    if (selectedCategory === 'all') return TRANSFORMS
    return TRANSFORMS.filter((t) => t.category === selectedCategory)
  }, [selectedCategory])

  const copyToClipboard = async (id: string, transformed: string) => {
    playCopySuccessSound()
    try {
      await navigator.clipboard.writeText(transformed)
      setCopiedId(id)
      useStore.getState().pushToast({
        id: `transform-copy-${Date.now()}`,
        message: `Copied ${id} transform to clipboard`,
        tone: 'info'
      })
      setTimeout(() => setCopiedId(null), 1500)
    } catch (err) {
      console.error('Failed to copy transformed text', err)
    }
  }

  const applyToCard = (transformed: string) => {
    playButtonClickSound()
    onApplyText?.(transformed)
    useStore.getState().pushToast({
      id: `transform-apply-${Date.now()}`,
      message: 'Card text updated with transformed content',
      tone: 'info'
    })
    playCardExpandSound(false)
    onClose()
  }

  const copyHash = async () => {
    if (!sha256) return
    playCopySuccessSound()
    try {
      await navigator.clipboard.writeText(sha256)
      setCopiedHash(true)
      useStore.getState().pushToast({
        id: `hash-copy-${Date.now()}`,
        message: 'SHA-256 checksum copied to clipboard',
        tone: 'info'
      })
      setTimeout(() => setCopiedHash(false), 1500)
    } catch (err) {
      console.error('Failed to copy hash', err)
    }
  }

  return (
    <motion.div
      className="transform-modal-card"
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
        gap: 12,
        color: '#e4e4e7',
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
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
          <span style={{ color: '#a78bfa', display: 'flex', alignItems: 'center' }}>
            <WandIcon size={16} />
          </span>
          <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: '0.01em', color: '#f4f4f5' }}>
            Text Transforms & Hashes
          </span>
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'rgba(167, 139, 250, 0.15)',
                border: '1px solid rgba(167, 139, 250, 0.3)',
                color: '#c4b5fd',
                fontWeight: 600
              }}
            >
              CRC32 {crc32.toUpperCase()}
            </span>
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

        {/* SHA-256 Checksum Card */}
        <div
          style={{
            width: '100%',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#a1a1aa', fontWeight: 600 }}>
              SHA-256 Checksum
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 11,
                color: '#e4e4e7',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={sha256}
            >
              {sha256 || 'Calculating...'}
            </div>
          </div>
          <button
            type="button"
            onClick={copyHash}
            style={{
              background: copiedHash ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              border: copiedHash ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
              color: copiedHash ? '#34d399' : '#e4e4e7',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0
            }}
          >
            {copiedHash ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
            <span>{copiedHash ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Category Pill Filters */}
        <div style={{ display: 'flex', gap: 6, width: '100%', overflowX: 'auto', paddingBottom: 2 }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'case', label: 'Casing' },
            { id: 'encoding', label: 'Encoding' },
            { id: 'json', label: 'JSON' },
            { id: 'clean', label: 'Clean' }
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                playButtonClickSound()
                setSelectedCategory(cat.id as any)
              }}
              style={{
                background: selectedCategory === cat.id ? 'rgba(167, 139, 250, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                border: selectedCategory === cat.id ? '1px solid rgba(167, 139, 250, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: selectedCategory === cat.id ? '#c4b5fd' : '#a1a1aa',
                borderRadius: 20,
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Scrollable Transform List */}
        <div
          className="edge-custom-scrollbar"
          style={{
            width: '100%',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 340,
            paddingRight: 4,
            overscrollBehavior: 'contain'
          }}
        >
          {filteredTransforms.map((t) => {
            const transformed = applyTransform(t.id, text)
            const isDifferent = transformed !== text
            const isCopied = copiedId === t.id
            const previewSnippet = transformed.slice(0, 48) + (transformed.length > 48 ? '...' : '')

            return (
              <div
                key={t.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#f4f4f5' }}>{t.label}</span>
                    <span style={{ fontSize: 10, color: '#71717a' }}>{t.description}</span>
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 10,
                      color: isDifferent ? '#a1a1aa' : '#71717a',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {previewSnippet || '(empty)'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(t.id, transformed)}
                    title={`Copy ${t.label} output`}
                    style={{
                      background: isCopied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                      border: isCopied ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: isCopied ? '#34d399' : '#e4e4e7',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 10,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    {isCopied ? <CheckIcon size={10} /> : <CopyIcon size={10} />}
                    <span>{isCopied ? 'Copied' : 'Copy'}</span>
                  </button>

                  {onApplyText && isDifferent && (
                    <button
                      type="button"
                      onClick={() => applyToCard(transformed)}
                      title={`Replace card text with ${t.label}`}
                      style={{
                        background: 'rgba(167, 139, 250, 0.15)',
                        border: '1px solid rgba(167, 139, 250, 0.3)',
                        color: '#c4b5fd',
                        borderRadius: 6,
                        padding: '3px 8px',
                        fontSize: 10,
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      Apply
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>
    )
  }
