/**
 * Clean Monospace Code Copy & Indent Normalization
 *
 * Responsibilities:
 *   - Normalizes mixed CRLF / LF line breaks across platforms.
 *   - Strips trailing whitespace per line while strictly preserving leading indentation.
 *   - Trims extraneous trailing blank lines.
 *   - Preserves intra-line tokens, quotes, and syntax structure.
 */

export function normalizeCleanCode(text: string, platform?: string): string {
  if (!text) return ''
  const isWin = platform ? platform === 'win32' : (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform))
  const lineEnding = isWin ? '\r\n' : '\n'

  const lines = text.split(/\r\n|\r|\n/)
  const cleaned = lines.map((line) => line.replace(/[ \t]+$/, ''))

  while (cleaned.length > 0 && cleaned[cleaned.length - 1] === '') {
    cleaned.pop()
  }

  return cleaned.join(lineEnding)
}
