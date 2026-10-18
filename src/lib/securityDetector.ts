/**
 * High-performance client-side Sensitive Token Shield.
 * Scans copied text for API keys, secret credentials, private keys, and JWTs,
 * providing zero-latency redaction for shoulder-surfing and screen sharing protection.
 */

export interface SensitiveDetectionResult {
  isSensitive: boolean
  tokenType: string | null
  matchedToken: string | null
  maskedText: string
}

export function maskToken(token: string): string {
  if (token.length <= 10) return '••••••••••••••••'
  const prefix = token.slice(0, 6)
  const suffix = token.slice(-4)
  return `${prefix}••••••••••••••••${suffix}`
}

interface TokenPattern {
  type: string
  regex: RegExp
  masker?: (match: string, fullText: string) => string
}

const PATTERNS: TokenPattern[] = [
  {
    type: 'Private Key',
    regex: /-----BEGIN (?:RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----(?:[\s\S]*?)-----END (?:RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----/,
    masker: (match) => {
      const header = match.match(/-----BEGIN [A-Z ]+-----/)?.[0] ?? '-----BEGIN PRIVATE KEY-----'
      const footer = match.match(/-----END [A-Z ]+-----/)?.[0] ?? '-----END PRIVATE KEY-----'
      return `${header} [MASKED PRIVATE KEY] ${footer}`
    }
  },
  {
    type: 'Anthropic API Key',
    regex: /\bsk-ant-[a-zA-Z0-9_\-]{20,}\b/
  },
  {
    type: 'OpenAI API Key',
    regex: /\bsk-(?:proj-|admin-)?[a-zA-Z0-9_\-]{20,}\b/
  },
  {
    type: 'GitHub Token',
    regex: /\b(?:ghp_[a-zA-Z0-9]{20,40}|github_pat_[a-zA-Z0-9_]{50,})\b/
  },
  {
    type: 'AWS Access Key',
    regex: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    type: 'JSON Web Token',
    regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/
  }
]

export function detectSensitiveToken(text: string): SensitiveDetectionResult {
  if (!text || typeof text !== 'string' || text.length < 16) {
    return {
      isSensitive: false,
      tokenType: null,
      matchedToken: null,
      maskedText: text || ''
    }
  }

  for (const p of PATTERNS) {
    const match = p.regex.exec(text)
    if (match) {
      const token = match[0]
      const masked = p.masker ? p.masker(token, text) : maskToken(token)
      const maskedText = text.replace(token, masked)
      return {
        isSensitive: true,
        tokenType: p.type,
        matchedToken: token,
        maskedText
      }
    }
  }

  return {
    isSensitive: false,
    tokenType: null,
    matchedToken: null,
    maskedText: text
  }
}
