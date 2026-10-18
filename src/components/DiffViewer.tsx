import { useState, useMemo, useEffect } from 'react'
import type { ClipboardItemDto, DiffResult } from '../../shared/types'
import { computeDiff, formatUnifiedDiff } from '../lib/diffEngine'
import { useStore } from '../store/appStore'
import { CopyIcon, CheckIcon, CloseIcon } from './icons'
import { playButtonClickSound } from '../lib/soundEffects'

export interface DiffViewerProps {
  currentItem: ClipboardItemDto
  currentText: string
  onClose: () => void
}

export function DiffViewer({ currentItem, currentText, onClose }: DiffViewerProps) {
  const items = useStore((s) => s.items)
  const pushToast = useStore((s) => s.pushToast)

  // Find candidate items for comparison (text items other than current)
  const candidateItems = useMemo(() => {
    return items.filter((it) => it.id !== currentItem.id && it.data.kind === 'text')
  }, [items, currentItem.id])

  const [selectedCompareId, setSelectedCompareId] = useState<string>(() => {
    return candidateItems[0]?.id || ''
  })

  const [compareText, setCompareText] = useState<string>('')
  const [loadingCompare, setLoadingCompare] = useState<boolean>(false)
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified')
  const [copiedPatch, setCopiedPatch] = useState<boolean>(false)

  // Load comparison text whenever selectedCompareId changes
  useEffect(() => {
    if (!selectedCompareId) {
      setCompareText('')
      return
    }
    const item = items.find((x) => x.id === selectedCompareId)
    if (!item || item.data.kind !== 'text') {
      setCompareText('')
      return
    }

    if (item.data.hasFullPayload) {
      setLoadingCompare(true)
      window.edge.getFullText(item.id)
        .then((t) => setCompareText(t))
        .catch(() => setCompareText(item.data.kind === 'text' ? item.data.text : ''))
        .finally(() => setLoadingCompare(false))
    } else {
      setCompareText(item.data.kind === 'text' ? item.data.text : '')
    }
  }, [selectedCompareId, items])

  // Compute diff
  const diffResult: DiffResult = useMemo(() => {
    return computeDiff(compareText, currentText)
  }, [compareText, currentText])

  const handleCopyPatch = () => {
    playButtonClickSound()
    const patch = formatUnifiedDiff(diffResult, 'Previous Item', 'Current Item')
    navigator.clipboard.writeText(patch)
    setCopiedPatch(true)
    pushToast({ id: 'diff-copied', message: 'Unified diff copied to clipboard', tone: 'info' })
    setTimeout(() => setCopiedPatch(false), 1500)
  }

  // Keyboard escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="diff-viewer-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="diff-viewer-header">
        <div className="diff-viewer-title-row">
          <div className="diff-viewer-title">
            <span>Clipboard Diff</span>
            <div className="diff-stats-badge">
              <span className="diff-stat-add">+{diffResult.stats.additions}</span>
              <span className="diff-stat-del">-{diffResult.stats.deletions}</span>
              <span className="diff-stat-common">{diffResult.stats.unchanged} unchanged</span>
            </div>
          </div>

          <div className="diff-header-actions">
            <div className="diff-view-mode-toggle">
              <button
                type="button"
                className={`diff-toggle-btn${viewMode === 'unified' ? ' active' : ''}`}
                onClick={() => { playButtonClickSound(); setViewMode('unified') }}
              >
                Unified
              </button>
              <button
                type="button"
                className={`diff-toggle-btn${viewMode === 'split' ? ' active' : ''}`}
                onClick={() => { playButtonClickSound(); setViewMode('split') }}
              >
                Split
              </button>
            </div>

            <button
              type="button"
              className="diff-action-btn"
              title="Copy unified diff patch"
              onClick={handleCopyPatch}
            >
              {copiedPatch ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
              <span>{copiedPatch ? 'Copied' : 'Copy Patch'}</span>
            </button>

            <button
              type="button"
              className="diff-close-btn"
              title="Close diff view (Escape)"
              onClick={() => { playButtonClickSound(); onClose() }}
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        </div>

        <div className="diff-selector-row">
          <span className="diff-selector-label">Comparing against:</span>
          {candidateItems.length > 0 ? (
            <select
              className="diff-compare-select"
              value={selectedCompareId}
              onChange={(e) => setSelectedCompareId(e.target.value)}
            >
              {candidateItems.map((c, i) => (
                <option key={c.id} value={c.id}>
                  {i === 0 ? 'Previous Item: ' : ''}
                  {(c.data.kind === 'text' ? c.data.text : '').slice(0, 50).replace(/\r?\n/g, ' ')}...
                </option>
              ))}
            </select>
          ) : (
            <span className="diff-empty-candidate">No previous text items found in history</span>
          )}
          {loadingCompare && <span className="diff-loading">Loading...</span>}
        </div>
      </div>

      <div className="diff-viewer-body">
        {viewMode === 'unified' ? (
          <div className="diff-unified-container">
            {diffResult.lines.map((line, idx) => (
              <div key={idx} className={`diff-line diff-line-${line.type}`}>
                <div className="diff-gutter">
                  <span className="diff-ln diff-ln-a">{line.lineA ?? ''}</span>
                  <span className="diff-ln diff-ln-b">{line.lineB ?? ''}</span>
                  <span className="diff-prefix">
                    {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                  </span>
                </div>
                <div className="diff-content">
                  {line.intraLineChanges ? (
                    line.intraLineChanges.map((tok, tIdx) => (
                      <span
                        key={tIdx}
                        className={tok.type !== 'common' ? `diff-intra-${tok.type}` : undefined}
                      >
                        {tok.value}
                      </span>
                    ))
                  ) : (
                    <span>{line.value || ' '}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="diff-split-container">
            <div className="diff-split-pane diff-split-left">
              <div className="diff-pane-title">Previous Content</div>
              {diffResult.lines
                .filter((l) => l.type !== 'add')
                .map((line, idx) => (
                  <div key={idx} className={`diff-line diff-line-${line.type}`}>
                    <div className="diff-gutter">
                      <span className="diff-ln">{line.lineA ?? ''}</span>
                      <span className="diff-prefix">{line.type === 'remove' ? '-' : ' '}</span>
                    </div>
                    <div className="diff-content">
                      {line.intraLineChanges ? (
                        line.intraLineChanges.map((tok, tIdx) => (
                          <span
                            key={tIdx}
                            className={tok.type === 'remove' ? 'diff-intra-remove' : undefined}
                          >
                            {tok.value}
                          </span>
                        ))
                      ) : (
                        <span>{line.value || ' '}</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            <div className="diff-split-pane diff-split-right">
              <div className="diff-pane-title">Current Content</div>
              {diffResult.lines
                .filter((l) => l.type !== 'remove')
                .map((line, idx) => (
                  <div key={idx} className={`diff-line diff-line-${line.type}`}>
                    <div className="diff-gutter">
                      <span className="diff-ln">{line.lineB ?? ''}</span>
                      <span className="diff-prefix">{line.type === 'add' ? '+' : ' '}</span>
                    </div>
                    <div className="diff-content">
                      {line.intraLineChanges ? (
                        line.intraLineChanges.map((tok, tIdx) => (
                          <span
                            key={tIdx}
                            className={tok.type === 'add' ? 'diff-intra-add' : undefined}
                          >
                            {tok.value}
                          </span>
                        ))
                      ) : (
                        <span>{line.value || ' '}</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
