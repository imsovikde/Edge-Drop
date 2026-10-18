import { memo } from 'react'
import { useStore } from '../store/appStore'
import type { ColorTag } from '../../shared/types'
import { playButtonClickSound } from '../lib/soundEffects'
import { TagIcon } from './icons'

const TAG_CONFIG: { id: ColorTag; label: string; color: string }[] = [
  { id: 'ruby', label: 'Ruby', color: '#ef4444' },
  { id: 'amber', label: 'Amber', color: '#f59e0b' },
  { id: 'emerald', label: 'Emerald', color: '#10b981' },
  { id: 'sapphire', label: 'Sapphire', color: '#3b82f6' },
  { id: 'violet', label: 'Violet', color: '#8b5cf6' },
  { id: 'slate', label: 'Slate', color: '#94a3b8' }
]

export const TagWorkspaceBar = memo(function TagWorkspaceBar({
  isHorizontal = false
}: {
  isHorizontal?: boolean
}) {
  const items = useStore((s) => s.items)
  const activeTagFilter = useStore((s) => s.activeTagFilter)
  const setActiveTagFilter = useStore((s) => s.setActiveTagFilter)

  // Tally counts per color tag
  const tagCounts: Record<ColorTag, number> = {
    ruby: 0,
    amber: 0,
    emerald: 0,
    sapphire: 0,
    violet: 0,
    slate: 0
  }

  let totalTagged = 0
  for (const it of items) {
    if (it.colorTag && tagCounts[it.colorTag] !== undefined) {
      tagCounts[it.colorTag]++
      totalTagged++
    }
  }

  // If no items are tagged and no tag filter is active, don't occupy shelf space
  if (totalTagged === 0 && !activeTagFilter) {
    return null
  }

  return (
    <div
      className={`tag-workspace-bar${isHorizontal ? ' horizontal' : ''}`}
      role="toolbar"
      aria-label="Color tag workspaces"
    >
      <div className="tag-workspace-label">
        <TagIcon width={12} height={12} />
        <span>Workspaces</span>
      </div>

      <div className="tag-workspace-scroll">
        <button
          type="button"
          className={`tag-workspace-pill${activeTagFilter === null ? ' is-active' : ''}`}
          onClick={() => {
            playButtonClickSound()
            setActiveTagFilter(null)
          }}
          title="All items"
        >
          <span>All</span>
          <span className="tag-pill-count">{items.length}</span>
        </button>

        {TAG_CONFIG.map(({ id, label, color }) => {
          const count = tagCounts[id]
          if (count === 0 && activeTagFilter !== id) return null
          const isActive = activeTagFilter === id

          return (
            <button
              key={id}
              type="button"
              className={`tag-workspace-pill tag-${id}${isActive ? ' is-active' : ''}`}
              onClick={() => {
                playButtonClickSound()
                setActiveTagFilter(isActive ? null : id)
              }}
              title={`${label} workspace (${count} items)`}
              style={{
                '--pill-color': color
              } as React.CSSProperties}
            >
              <span className="tag-dot" style={{ backgroundColor: color }} />
              <span>{label}</span>
              <span className="tag-pill-count">{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
})
