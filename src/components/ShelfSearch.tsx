/**
 * ShelfSearch — the clipboard search box.
 *
 * Typing needs OS keyboard focus, which the shelf normally never takes. So
 * engaging this input temporarily makes the window focusable (and pauses the
 * global toggle hotkey so typing can't yank the shelf), and every exit hands
 * everything back. The main process captured the user's app at open time and
 * again at engage time, so a click on an item still pastes into that app.
 *
 * Engagement starts on pointer-down, NOT on focus: a NOACTIVATE window may
 * never produce a focus event from a plain click, so waiting for onFocus
 * would make the box look dead.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store/appStore'
import { edge } from '../lib/edge'
import { noteSearchEngaged } from '../lib/searchFocus'
import { useTranslation } from '../i18n'
import { CloseIcon, SearchIcon } from './icons'
import { playButtonClickSound } from '../lib/soundEffects'

export function ShelfSearch() {
  const { t } = useTranslation()
  const query = useStore((s) => s.query)
  const setQuery = useStore((s) => s.setQuery)
  const deepSearchActive = useStore((s) => s.deepSearchActive)
  const setDeepSearchActive = useStore((s) => s.setDeepSearchActive)
  const dateRangeFilter = useStore((s) => s.dateRangeFilter)
  const setDateRangeFilter = useStore((s) => s.setDateRangeFilter)
  const inputRef = useRef<HTMLInputElement>(null)
  const engagedRef = useRef(false)

  const disengage = useCallback(() => {
    if (!engagedRef.current) return
    engagedRef.current = false
    noteSearchEngaged(false)
    try {
      void edge.focusWindow(false)?.catch?.(() => {})
    } catch { /* ignore */ }
    try {
      void edge.pauseHotkey(false)?.catch?.(() => {})
    } catch { /* ignore */ }
  }, [])

  // Engage BEFORE focus can happen: pointer-down always fires, focus may not.
  // Idempotent — the focus-event backup below reuses it safely.
  const engage = useCallback(() => {
    if (engagedRef.current) return
    engagedRef.current = true
    noteSearchEngaged(true)
    try {
      window.focus()
    } catch { /* ignore */ }
    try {
      const p = edge.focusWindow(true) as unknown as Promise<void> | undefined
      if (p && typeof (p as Promise<void>).then === 'function') {
        ;(p as Promise<void>).then(() => {
          try { inputRef.current?.focus() } catch { /* ignore */ }
        }).catch(() => {})
      } else {
        try { inputRef.current?.focus() } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    try {
      void edge.pauseHotkey(true)?.catch?.(() => {})
    } catch { /* ignore */ }
  }, [])

  // Safety: if the input unmounts mid-focus (view switch), restore state.
  useEffect(() => () => {
    disengage()
  }, [disengage])

  return (
    <>
      <div className={`search${query ? ' has-query' : ''}`}>
      <SearchIcon className="search-icon" width={14} height={14} />
      <input
        ref={inputRef}
        type="text"
        placeholder={t('header.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onPointerDown={() => {
          engage()
        }}
        onFocus={() => {
          engage()
        }}
        onBlur={() => {
          disengage()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Staged Escape: clear first, blur second — never close the
            // panel while typing (the window handler skips inputs as well).
            e.stopPropagation()
            if (query) {
              setQuery('')
            } else {
              inputRef.current?.blur()
            }
          }
        }}
        spellCheck={false}
      />
      {/* Clear (macOS search-field style). It must never touch focus: the
          OS-focus handover above is driven purely by the input's own
          focus/blur. So the button can't take focus (mousedown/pointerdown
          cancelled, out of the tab order; Escape clears from the keyboard)
          and it never calls focus() — after an app switch the page still
          remembers the input as focused, and refocusing it from here could
          pull OS focus back from the user's app. If the user was typing,
          the input simply keeps focus. Always mounted so it can fade. */}
      <button
        type="button"
        className="search-clear"
        aria-label={t('item.clear')}
        title={t('item.clear')}
        tabIndex={-1}
        aria-hidden={!query}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setQuery('')}
      >
        <CloseIcon width={10} height={10} weight="bold" />
      </button>
      <button
        type="button"
        className={`search-deep-toggle${deepSearchActive ? ' active' : ''}`}
        title={deepSearchActive ? 'Deep Vault Search active: scanning off-memory payloads' : 'Enable Deep Vault Search (scan full disk payloads)'}
        tabIndex={-1}
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={() => {
          playButtonClickSound()
          setDeepSearchActive(!deepSearchActive)
        }}
      >
        <span>⚡ Deep</span>
      </button>
    </div>
    {(query || deepSearchActive || dateRangeFilter !== 'all') && (
      <div className="search-date-filters">
        {(['all', 'today', 'week', 'month'] as const).map((range) => (
          <button
            key={range}
            type="button"
            className={`search-date-chip${dateRangeFilter === range ? ' active' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={() => {
              playButtonClickSound()
              setDateRangeFilter(range)
            }}
          >
            {range === 'all' ? 'All' : range === 'today' ? 'Today' : range === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>
    )}
    </>
  )
}
