/**
 * Zero-dependency URL Sanitizer for Edge-Drop.
 * Strips aggressive marketing, affiliate, and behavioral tracking parameters (UTM, Facebook, Google, YouTube, Twitter)
 * while strictly preserving critical query parameters (search, pagination, video timestamps, auth).
 */

const UNIVERSAL_TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'utm_cid',
  'utm_reader',
  'utm_viz_id',
  'utm_pubreferrer',
  'utm_swu',
  'fbclid',
  'igshid',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',
  'gclid',
  'gclsrc',
  'dclid',
  'twclid',
  'ttclid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'hscatracking',
  'msclkid',
  'spm',
  'scm',
  'ved',
  'ei',
  'sei',
  'sourceid',
  'sxsrf',
  'wickedid',
  'yclid',
  '_openstat'
])

export interface CleanUrlResult {
  cleanedUrl: string
  hasTracking: boolean
  removedParams: string[]
}

/**
 * Check if a parameter name is a known marketing tracker.
 */
export function isTrackingParam(paramName: string, hostname = ''): boolean {
  const lower = paramName.toLowerCase()
  if (UNIVERSAL_TRACKING_PARAMS.has(lower) || lower.startsWith('utm_') || lower.startsWith('ga_')) {
    return true
  }

  // YouTube tracking: 'si' is tracking ID, but 't' is start time
  if ((hostname.includes('youtube.com') || hostname.includes('youtu.be')) && lower === 'si') {
    return true
  }

  // Twitter/X tracking: 's' is tracking ID
  if ((hostname.includes('twitter.com') || hostname.includes('x.com')) && (lower === 's' || lower === 'ref_src')) {
    return true
  }

  return false
}

/**
 * Sanitizes a URL by stripping known tracking parameters while preserving functional ones.
 */
export function cleanUrl(rawUrl: string): CleanUrlResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { cleanedUrl: rawUrl, hasTracking: false, removedParams: [] }
  }

  try {
    const parsed = new URL(rawUrl)
    // Only sanitize http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { cleanedUrl: rawUrl, hasTracking: false, removedParams: [] }
    }

    const removedParams: string[] = []
    const searchParams = new URLSearchParams(parsed.search)
    const keys = Array.from(searchParams.keys())

    for (const key of keys) {
      if (isTrackingParam(key, parsed.hostname)) {
        removedParams.push(key)
        searchParams.delete(key)
      }
    }

    if (removedParams.length === 0) {
      return { cleanedUrl: rawUrl, hasTracking: false, removedParams: [] }
    }

    const remainingSearch = searchParams.toString()
    parsed.search = remainingSearch ? `?${remainingSearch}` : ''

    return {
      cleanedUrl: parsed.toString(),
      hasTracking: true,
      removedParams
    }
  } catch {
    return { cleanedUrl: rawUrl, hasTracking: false, removedParams: [] }
  }
}

/**
 * Quick helper returning only the cleaned string.
 */
export function stripTrackingParams(rawUrl: string): string {
  return cleanUrl(rawUrl).cleanedUrl
}
