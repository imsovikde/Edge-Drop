/**
 * useFilteredItems — derives the visible, grouped item list from raw state.
 *
 * Split into Pinned (favorites) and Recent (everything else), then apply the
 * search query. Kept as a selector so components stay presentational.
 */
import { useMemo } from 'react'
import { useStore } from '../store/appStore'
import type { ClipboardItemDto, TypeFilter } from '../../shared/types'
import { basename, isImagePath } from '../lib/format'
import { parseColor } from '../lib/colorUtils'
import { detectSensitiveToken } from '../lib/securityDetector'
import { hasMacroTokens } from '../lib/macroEngine'
import { detectCode } from '../lib/codeDetect'

export interface ParsedSearchQuery {
  operators: { key: string; val: string }[]
  terms: string[]
}

/**
 * Parses search strings into smart operator tokens (e.g. is:pinned, is:link, is:code, tag:ruby)
 * and free-text search terms.
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  if (!query) return { operators: [], terms: [] }
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  const operators: { key: string; val: string }[] = []
  const terms: string[] = []

  for (const token of tokens) {
    const colonIdx = token.indexOf(':')
    if (colonIdx > 0 && colonIdx < token.length - 1) {
      const key = token.slice(0, colonIdx).toLowerCase()
      const val = token.slice(colonIdx + 1).toLowerCase()
      operators.push({ key, val })
    } else {
      terms.push(token.toLowerCase())
    }
  }

  return { operators, terms }
}

/**
 * Matches an item against smart operators (is:pinned, is:link, is:image, is:code, is:secret, tag:ruby)
 * and text search terms.
 */
export function matchesSmartQuery(it: ClipboardItemDto, parsed: ParsedSearchQuery): boolean {
  const { operators, terms } = parsed

  // Evaluate operator constraints
  for (const { key, val } of operators) {
    if (key === 'is') {
      if (val === 'pin' || val === 'pinned') {
        if (!it.pinned) return false
      } else if (val === 'unpin' || val === 'unpinned') {
        if (it.pinned) return false
      } else if (val === 'url' || val === 'link') {
        if (it.data.kind !== 'text' || !it.data.isUrl) return false
      } else if (val === 'img' || val === 'image') {
        if (it.data.kind !== 'image' && it.data.kind !== 'image-collection' && !isImageOnlyFileItem(it)) return false
      } else if (val === 'file' || val === 'files') {
        if (it.data.kind !== 'files' || isImageOnlyFileItem(it)) return false
      } else if (val === 'color' || val === 'colour') {
        if (it.data.kind !== 'text' || (!it.data.isColor && !parseColor(it.data.text))) return false
      } else if (val === 'code') {
        if (it.data.kind !== 'text' || !detectCode(it.data.text).isCode) return false
      } else if (val === 'secret' || val === 'token') {
        if (it.data.kind !== 'text' || !detectSensitiveToken(it.data.text).isSensitive) return false
      } else if (val === 'macro') {
        if (it.data.kind !== 'text' || !hasMacroTokens(it.data.text)) return false
      }
    } else if (key === 'tag') {
      if (val === 'any') {
        if (!it.colorTag) return false
      } else {
        if (!it.colorTag || it.colorTag.toLowerCase() !== val) return false
      }
    } else if (key === 'has') {
      if (val === 'tag') {
        if (!it.colorTag) return false
      }
    }
  }

  // If there are no terms, all operator constraints matched
  if (terms.length === 0) return true

  // Evaluate text terms against item contents
  return terms.every((term) => {
    switch (it.data.kind) {
      case 'text':
        return it.data.text.toLowerCase().includes(term)
      case 'files':
        return it.data.paths.some((p) => basename(p).toLowerCase().includes(term))
      case 'image': {
        const name = it.data.fileName || it.data.imageId || 'image'
        return name.toLowerCase().includes(term)
      }
      case 'image-collection':
        return it.data.images.some((img) => (img.fileName || img.imageId || 'image').toLowerCase().includes(term))
    }
  })
}


export function matches(it: ClipboardItemDto, q: string): boolean {
  if (!q) return true
  return matchesSmartQuery(it, parseSearchQuery(q))
}


/**
 * Explorer-copied photos are stored as `files` but belong in Images, not Files.
 * Mixed stacks (photo + PDF) stay in Files only.
 */
export function isImageOnlyFileItem(it: ClipboardItemDto): boolean {
  if (it.data.kind !== 'files') return false
  const paths = it.data.paths
  if (paths.length === 0) return false
  if (it.data.entries?.some((en) => en.isDirectory)) return false
  return paths.every((p) => isImagePath(p))
}

export function itemMatchesTypeFilter(it: ClipboardItemDto, filter: TypeFilter): boolean {
  if (filter === 'all') return true
  switch (filter) {
    case 'text':
      return it.data.kind === 'text' && !it.data.isUrl && !it.data.isColor && !parseColor(it.data.text)
    case 'links':
      return it.data.kind === 'text' && !!it.data.isUrl
    case 'images':
      if (it.data.kind === 'image' || it.data.kind === 'image-collection') return true
      return isImageOnlyFileItem(it)
    case 'files':
      return it.data.kind === 'files' && !isImageOnlyFileItem(it)
    case 'colors':
      return it.data.kind === 'text' && (!!it.data.isColor || !!parseColor(it.data.text))
  }
}

export interface GroupedItems {
  pinned: ClipboardItemDto[]
  recent: ClipboardItemDto[]
}

export function useFilteredItems(): GroupedItems {
  const items = useStore((s) => s.items)
  const query = useStore((s) => s.query)
  const typeFilter = useStore((s) => s.typeFilter)
  const activeTagFilter = useStore((s) => s.activeTagFilter)
  const dateRangeFilter = useStore((s) => s.dateRangeFilter)
  const deepSearchActive = useStore((s) => s.deepSearchActive)
  const deepSearchResults = useStore((s) => s.deepSearchResults)
  const tutorialStep = useStore((s) => s.tutorialStep)

  return useMemo(() => {
    const pinned: ClipboardItemDto[] = []
    const recent: ClipboardItemDto[] = []

    const now = Date.now()
    let timeCutoff = 0
    if (dateRangeFilter === 'today') {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      timeCutoff = d.getTime()
    } else if (dateRangeFilter === 'week') {
      timeCutoff = now - 7 * 86400000
    } else if (dateRangeFilter === 'month') {
      timeCutoff = now - 30 * 86400000
    }

    const filteredByTutorial = items.filter((it) => {
      if (tutorialStep <= 0) return true
      switch (tutorialStep) {
        case 1:
          return it.id === 'onboarding-welcome'
        case 2:
          return false
        case 3:
          return it.id === 'onboarding-image' || !it.id.startsWith('onboarding-')
        case 4:
          return it.id === 'onboarding-files'
        case 5:
          return true
        default:
          return true
      }
    })

    const trimmedQuery = query.trim()
    const parsedQuery = parseSearchQuery(trimmedQuery)

    for (const it of filteredByTutorial) {
      if (timeCutoff > 0 && it.capturedAt < timeCutoff) continue

      if (deepSearchActive && trimmedQuery) {
        if (!deepSearchResults[it.id]) continue
      } else if (trimmedQuery) {
        if (!matchesSmartQuery(it, parsedQuery)) continue
      }


      if (!itemMatchesTypeFilter(it, typeFilter)) continue
      if (activeTagFilter && activeTagFilter !== 'all') {
        const matchesColor = it.colorTag === activeTagFilter
        const matchesCustom = it.tags && it.tags.includes(activeTagFilter)
        if (!matchesColor && !matchesCustom) continue
      }
      ;(it.pinned ? pinned : recent).push(it)
    }
    return { pinned, recent }
  }, [items, query, typeFilter, activeTagFilter, dateRangeFilter, deepSearchActive, deepSearchResults, tutorialStep])
}
