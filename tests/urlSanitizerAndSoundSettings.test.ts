import { describe, it, expect, beforeEach } from 'vitest'
import { cleanUrl, stripTrackingParams, isTrackingParam } from '../src/lib/cleanUrl'
import { getSoundVolume, isSoundEnabled, getMasterDestination } from '../src/lib/soundEffects'
import { useStore } from '../src/store/appStore'

describe('URL Sanitizer (Zero-Dependency Privacy Guard)', () => {
  it('identifies universal marketing tracking parameters', () => {
    expect(isTrackingParam('utm_source')).toBe(true)
    expect(isTrackingParam('utm_campaign')).toBe(true)
    expect(isTrackingParam('fbclid')).toBe(true)
    expect(isTrackingParam('gclid')).toBe(true)
    expect(isTrackingParam('msclkid')).toBe(true)
    expect(isTrackingParam('twclid')).toBe(true)
  })

  it('identifies platform-specific tracking parameters while ignoring functional ones', () => {
    // YouTube
    expect(isTrackingParam('si', 'www.youtube.com')).toBe(true)
    expect(isTrackingParam('si', 'youtu.be')).toBe(true)
    expect(isTrackingParam('t', 'www.youtube.com')).toBe(false)
    expect(isTrackingParam('v', 'www.youtube.com')).toBe(false)

    // Twitter / X
    expect(isTrackingParam('s', 'twitter.com')).toBe(true)
    expect(isTrackingParam('s', 'x.com')).toBe(true)
    expect(isTrackingParam('ref_src', 'x.com')).toBe(true)
    expect(isTrackingParam('t', 'twitter.com')).toBe(false)
  })

  it('strips aggressive tracking parameters from YouTube links while preserving video ID and timestamp', () => {
    const raw = 'https://youtu.be/dQw4w9WgXcQ?si=abcdef123456&t=42'
    const res = cleanUrl(raw)

    expect(res.hasTracking).toBe(true)
    expect(res.removedParams).toEqual(['si'])
    expect(res.cleanedUrl).toBe('https://youtu.be/dQw4w9WgXcQ?t=42')
  })

  it('strips full suite of UTM parameters and fbclid from marketing campaign URLs', () => {
    const raw = 'https://example.com/product/laptop?utm_source=newsletter&utm_medium=email&utm_campaign=spring_sale&fbclid=IwAR2918273&color=midnight&tab=specs'
    const res = cleanUrl(raw)

    expect(res.hasTracking).toBe(true)
    expect(res.removedParams).toContain('utm_source')
    expect(res.removedParams).toContain('utm_medium')
    expect(res.removedParams).toContain('utm_campaign')
    expect(res.removedParams).toContain('fbclid')

    // Functional parameters strictly retained
    expect(res.cleanedUrl).toContain('color=midnight')
    expect(res.cleanedUrl).toContain('tab=specs')
    expect(res.cleanedUrl).not.toContain('utm_source')
    expect(res.cleanedUrl).not.toContain('fbclid')
  })

  it('leaves clean URLs untouched with hasTracking = false', () => {
    const raw = 'https://github.com/imsovikde/Edge-Drop/releases/tag/v2.3.0?tab=readme'
    const res = cleanUrl(raw)

    expect(res.hasTracking).toBe(false)
    expect(res.removedParams).toHaveLength(0)
    expect(res.cleanedUrl).toBe(raw)
  })

  it('gracefully handles non-URLs, invalid protocols, and malformed strings', () => {
    expect(cleanUrl('just some random clipboard text').hasTracking).toBe(false)
    expect(cleanUrl('mailto:test@example.com?subject=Hello').hasTracking).toBe(false)
    expect(cleanUrl('').cleanedUrl).toBe('')
  })

  it('stripTrackingParams helper returns cleaned string directly', () => {
    const raw = 'https://twitter.com/developer/status/123456789?s=20&ref_src=twsrc%5Etfw'
    const cleaned = stripTrackingParams(raw)
    expect(cleaned).toBe('https://twitter.com/developer/status/123456789')
  })
})

describe('Sound Effects Volume & Master Routing', () => {
  beforeEach(() => {
    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        soundEffects: true,
        soundEffectsVolume: 0.75
      }
    })
  })

  it('returns default 0.75 volume when soundEffectsVolume is unset', () => {
    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        soundEffectsVolume: undefined
      }
    })
    expect(getSoundVolume()).toBe(0.75)
  })

  it('clamps custom volume between 0.0 and 1.0', () => {
    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        soundEffectsVolume: 0.25
      }
    })
    expect(getSoundVolume()).toBe(0.25)

    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        soundEffectsVolume: 1.5
      }
    })
    expect(getSoundVolume()).toBe(1.0)

    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        soundEffectsVolume: -0.5
      }
    })
    expect(getSoundVolume()).toBe(0)
  })

  it('reports sound as disabled when soundEffects is false or volume is 0', () => {
    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        soundEffects: false,
        soundEffectsVolume: 0.75
      }
    })
    expect(isSoundEnabled()).toBe(false)

    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        soundEffects: true,
        soundEffectsVolume: 0
      }
    })
    expect(isSoundEnabled()).toBe(false)
  })

  it('creates and caches master gain node routed to destination', () => {
    const mockDestination = { type: 'destination' }
    const gainNode = {
      gain: {
        setValueAtTime: (val: number) => {
          gainNode.gain.value = val
        },
        value: 1
      },
      connect: (_dest: any) => {}
    }

    const mockCtx = {
      currentTime: 10,
      destination: mockDestination,
      createGain: () => gainNode,
      _masterGain: null
    }

    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        soundEffectsVolume: 0.5
      }
    })

    const dest1 = getMasterDestination(mockCtx)
    expect(dest1).toBe(gainNode)
    expect(gainNode.gain.value).toBe(0.5)

    // Second call reuses same master gain node
    const dest2 = getMasterDestination(mockCtx)
    expect(dest2).toBe(gainNode)
  })
})
