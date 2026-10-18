import React, { useState } from 'react'
import { useStore } from '../store/appStore'
import { CopyIcon, PinIcon, TrashIcon, CloseIcon, CheckIcon, TagIcon } from './icons'
import { playButtonClickSound, playCopySuccessSound, playDeleteSound, playToggleSound } from '../lib/soundEffects'
import type { ColorTag } from '../../shared/types'

const COLOR_OPTIONS: { id: ColorTag; label: string; color: string }[] = [
  { id: 'ruby', label: 'Ruby', color: '#ef4444' },
  { id: 'amber', label: 'Amber', color: '#f59e0b' },
  { id: 'emerald', label: 'Emerald', color: '#10b981' },
  { id: 'sapphire', label: 'Sapphire', color: '#3b82f6' },
  { id: 'violet', label: 'Violet', color: '#8b5cf6' },
  { id: 'slate', label: 'Slate', color: '#64748b' }
]

interface BatchActionCapsuleProps {
  allVisibleIds: string[]
}

export const BatchActionCapsule: React.FC<BatchActionCapsuleProps> = ({ allVisibleIds }) => {
  const selectedItemIds = useStore((s) => s.selectedItemIds)
  const batchPin = useStore((s) => s.batchPin)
  const batchSetColorTag = useStore((s) => s.batchSetColorTag)
  const batchCombineCopy = useStore((s) => s.batchCombineCopy)
  const batchDelete = useStore((s) => s.batchDelete)
  const clearSelection = useStore((s) => s.clearSelection)
  const selectAllItems = useStore((s) => s.selectAllItems)
  const pushToast = useStore((s) => s.pushToast)

  const [tagFlyoutOpen, setTagFlyoutOpen] = useState(false)
  const [copiedCombined, setCopiedCombined] = useState(false)

  if (selectedItemIds.length === 0) return null

  const isAllSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedItemIds.includes(id))

  const handleCombineCopy = async () => {
    playCopySuccessSound()
    const count = await batchCombineCopy()
    setCopiedCombined(true)
    pushToast({
      id: `combine-copy-${Date.now()}`,
      message: `Combined and copied text from ${count} item${count > 1 ? 's' : ''}`,
      tone: 'info'
    })
    setTimeout(() => setCopiedCombined(false), 1500)
  }

  const handleBatchPin = async () => {
    playToggleSound(true)
    await batchPin(true)
    pushToast({
      id: `batch-pin-${Date.now()}`,
      message: `Pinned ${selectedItemIds.length} item${selectedItemIds.length > 1 ? 's' : ''}`,
      tone: 'info'
    })
  }

  const handleBatchDelete = async () => {
    playDeleteSound()
    const count = selectedItemIds.length
    await batchDelete()
    pushToast({
      id: `batch-del-${Date.now()}`,
      message: `Deleted ${count} item${count > 1 ? 's' : ''}`,
      tone: 'info'
    })
  }

  const handleBatchTag = async (color: ColorTag) => {
    playToggleSound(true)
    await batchSetColorTag(color)
    setTagFlyoutOpen(false)
    pushToast({
      id: `batch-tag-${Date.now()}`,
      message: `Applied ${color} tag to ${selectedItemIds.length} items`,
      tone: 'info'
    })
  }

  return (
    <div
      className="batch-action-capsule-container"
      style={{
        position: 'sticky',
        bottom: 8,
        left: 0,
        right: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 8px',
        pointerEvents: 'none',
        animation: 'slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <div
        className="batch-action-capsule"
        style={{
          pointerEvents: 'auto',
          background: 'rgba(20, 20, 26, 0.94)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: 24,
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55), 0 0 1px 1px rgba(255, 255, 255, 0.08) inset',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: '#e4e4e7',
          fontSize: 12,
          position: 'relative'
        }}
      >
        {/* Count Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <span
            style={{
              background: 'rgba(99, 102, 241, 0.25)',
              border: '1px solid rgba(99, 102, 241, 0.45)',
              color: '#818cf8',
              borderRadius: 12,
              padding: '1px 7px',
              fontSize: 11
            }}
          >
            {selectedItemIds.length}
          </span>
          <span style={{ fontSize: 11, color: '#f4f4f5' }}>Selected</span>
        </div>

        <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.12)' }} />

        {/* Select All / Deselect Toggle */}
        <button
          type="button"
          onClick={() => {
            playButtonClickSound()
            if (isAllSelected) {
              clearSelection()
            } else {
              selectAllItems(allVisibleIds)
            }
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#a1a1aa',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
            padding: '2px 4px'
          }}
        >
          {isAllSelected ? 'Deselect All' : 'Select All'}
        </button>

        <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.12)' }} />

        {/* Combine Copy */}
        <button
          type="button"
          onClick={handleCombineCopy}
          title="Combine text of selected items and copy to clipboard"
          style={{
            background: copiedCombined ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
            border: copiedCombined ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
            color: copiedCombined ? '#34d399' : '#e4e4e7',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          {copiedCombined ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          <span>Combine</span>
        </button>

        {/* Batch Pin */}
        <button
          type="button"
          onClick={handleBatchPin}
          title="Pin all selected items"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#e4e4e7',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          <PinIcon size={12} />
          <span>Pin</span>
        </button>

        {/* Batch Tag Button */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => {
              playButtonClickSound()
              setTagFlyoutOpen(!tagFlyoutOpen)
            }}
            title="Apply color tag to selected items"
            style={{
              background: tagFlyoutOpen ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.06)',
              border: tagFlyoutOpen ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: tagFlyoutOpen ? '#818cf8' : '#e4e4e7',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <TagIcon size={12} />
            <span>Tag</span>
          </button>

          {/* Tag Palette Flyout */}
          {tagFlyoutOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: 8,
                background: 'rgba(24, 24, 30, 0.98)',
                backdropFilter: 'blur(14px)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                padding: '6px 8px',
                display: 'flex',
                gap: 6,
                zIndex: 60
              }}
            >
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  onClick={() => handleBatchTag(c.id)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: c.color,
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    cursor: 'pointer',
                    padding: 0
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Batch Delete */}
        <button
          type="button"
          onClick={handleBatchDelete}
          title="Delete selected items"
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          <TrashIcon size={12} />
          <span>Delete</span>
        </button>

        {/* Clear Selection X */}
        <button
          type="button"
          onClick={() => {
            playButtonClickSound()
            clearSelection()
          }}
          title="Clear Selection"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#a1a1aa',
            padding: 2,
            borderRadius: 4,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center'
          }}
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  )
}
