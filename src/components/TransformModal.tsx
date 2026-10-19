import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
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
  onApplyText?: (newText: string) => void
}

export const TransformModal: React.FC<TransformModalProps> = ({
  text,
  onClose,
  onApplyText
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'case' | 'encoding' | 'json' | 'clean'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedHash, setCopiedHash] = useState(false)
  const [sha256, setSha256] = useState<string>('')

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
        playCardExpandSound(false)
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      mounted = false
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [text, onClose])

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

  return createPortal(
    <div
      className="transform-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          playCardExpandSound(false)
          onClose()
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.76)',
        backdropFilter: 'blur(12px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <div
        className="transform-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: '85vh',
          background: 'linear-gradient(180deg, rgba(28, 28, 35, 0.98) 0%, rgba(18, 18, 23, 0.98) 100%)',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65), 0 0 1px 1px rgba(255, 255, 255, 0.08) inset',
          padding: '16px 18px',
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
            onClick={() => {
              playCardExpandSound(false)
              onClose()
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center'
            }}
            title="Close (Esc)"
          >
            <CloseIcon size={14} />
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
          style={{
            width: '100%',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 320,
            paddingRight: 2
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
      </div>
    </div>,
    document.body
  )
}
