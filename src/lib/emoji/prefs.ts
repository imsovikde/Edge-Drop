/** Local, renderer-only emoji picker preferences. Not part of Settings IPC. */

const RECENTS_KEY = 'edge-drop.emoji.recents'
const TONE_KEY = 'edge-drop.emoji.skinTone'

interface MinimalStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function storage(): MinimalStorage | null {
  try {
    const g = globalThis as { localStorage?: MinimalStorage }
    return g.localStorage ?? null
  } catch {
    return null
  }
}

export function loadRecents(): string[] {
  try {
    const fromWindow = (globalThis as any).__edgeDropEmojiRecents
    if (Array.isArray(fromWindow) && fromWindow.length > 0) return fromWindow
  } catch { /* ignore */ }

  const raw = storage()?.getItem(RECENTS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 80)
  } catch {
    return []
  }
}

export function saveRecents(unifieds: readonly string[]): void {
  const arr = [...unifieds]
  try {
    (globalThis as any).__edgeDropEmojiRecents = arr
    storage()?.setItem(RECENTS_KEY, JSON.stringify(arr))
  } catch {
    /* quota / private mode */
  }

  try {
    const g = globalThis as any
    if (typeof g.window !== 'undefined' && typeof g.CustomEvent !== 'undefined') {
      g.window.dispatchEvent(new g.CustomEvent('edge-drop:emoji-recents-updated', { detail: arr }))
    }
  } catch { /* ignore */ }
}

export function loadSkinToneId(): number {
  const raw = storage()?.getItem(TONE_KEY)
  const n = raw == null ? 0 : Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0
}

export function saveSkinToneId(id: number): void {
  try {
    storage()?.setItem(TONE_KEY, String(id))
  } catch {
    /* ignore */
  }
}
