/**
 * Zero-overhead dynamic macro expansion engine for snippet templates.
 * Supported tokens:
 *   {{date}}       -> YYYY-MM-DD (e.g. 2026-10-18)
 *   {{time}}       -> HH:MM (24h format, e.g. 13:20)
 *   {{time:12}}    -> h:mm A (12h format, e.g. 1:20 PM)
 *   {{datetime}}   -> ISO 8601 string (e.g. 2026-10-18T13:20:00)
 *   {{timestamp}}  -> Unix epoch timestamp in milliseconds
 *   {{year}}       -> 4-digit year (e.g. 2026)
 *   {{month}}      -> 2-digit month (01-12)
 *   {{day}}        -> 2-digit day (01-31)
 *   {{uuid}}       -> RFC 4122 v4 UUID
 *   {{clipboard}}  -> Current text on clipboard inserted inline
 */

const MACRO_PATTERN = /\{\{([a-zA-Z0-9_:-]+)\}\}/g

export function hasMacroTokens(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false
  if (!text.includes('{{') || !text.includes('}}')) return false
  MACRO_PATTERN.lastIndex = 0
  return MACRO_PATTERN.test(text)
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID()
    } catch {
      /* fallback */
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function expandMacroTokens(
  template: string,
  options?: {
    clipboardText?: string
    now?: Date
  }
): string {
  if (!template || typeof template !== 'string') return ''
  if (!template.includes('{{') || !template.includes('}}')) return template

  const now = options?.now ?? new Date()
  const clipboardText = options?.clipboardText ?? ''

  return template.replace(/\{\{([a-zA-Z0-9_:-]+)\}\}/g, (match, tokenName: string) => {
    const key = tokenName.trim().toLowerCase()
    switch (key) {
      case 'date': {
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      }
      case 'time': {
        return `${pad(now.getHours())}:${pad(now.getMinutes())}`
      }
      case 'time:12': {
        const hours24 = now.getHours()
        const hours12 = hours24 % 12 || 12
        const ampm = hours24 >= 12 ? 'PM' : 'AM'
        return `${hours12}:${pad(now.getMinutes())} ${ampm}`
      }
      case 'datetime': {
        const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
        const t = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
        return `${d}T${t}`
      }
      case 'timestamp': {
        return String(now.getTime())
      }
      case 'year': {
        return String(now.getFullYear())
      }
      case 'month': {
        return pad(now.getMonth() + 1)
      }
      case 'day': {
        return pad(now.getDate())
      }
      case 'uuid': {
        return generateUuid()
      }
      case 'clipboard': {
        return clipboardText
      }
      default: {
        return match
      }
    }
  })
}
