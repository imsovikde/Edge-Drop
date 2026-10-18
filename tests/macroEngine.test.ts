import { describe, it, expect } from 'vitest'
import { hasMacroTokens, expandMacroTokens } from '../src/lib/macroEngine'

describe('macroEngine - dynamic snippet expansion', () => {
  const fixedDate = new Date(2026, 9, 18, 14, 30, 45, 0) // Oct 18, 2026 14:30:45

  it('detects presence of macro tokens accurately', () => {
    expect(hasMacroTokens('Meeting notes {{date}}')).toBe(true)
    expect(hasMacroTokens('UUID: {{uuid}}')).toBe(true)
    expect(hasMacroTokens('No tokens here')).toBe(false)
    expect(hasMacroTokens('Incomplete {{token')).toBe(false)
    expect(hasMacroTokens('Empty {{}}')).toBe(false)
    expect(hasMacroTokens('')).toBe(false)
    expect(hasMacroTokens(null as any)).toBe(false)
  })

  it('expands {{date}}, {{year}}, {{month}}, {{day}} correctly', () => {
    const text = 'Today is {{date}}, Year: {{year}}, Month: {{month}}, Day: {{day}}'
    const result = expandMacroTokens(text, { now: fixedDate })
    expect(result).toBe('Today is 2026-10-18, Year: 2026, Month: 10, Day: 18')
  })

  it('expands {{time}} and {{time:12}} correctly', () => {
    const text24 = 'Current time is {{time}}'
    expect(expandMacroTokens(text24, { now: fixedDate })).toBe('Current time is 14:30')

    const text12 = 'Current time is {{time:12}}'
    expect(expandMacroTokens(text12, { now: fixedDate })).toBe('Current time is 2:30 PM')
  })

  it('expands {{datetime}} and {{timestamp}} correctly', () => {
    const text = 'ISO: {{datetime}}, Epoch: {{timestamp}}'
    const result = expandMacroTokens(text, { now: fixedDate })
    expect(result).toBe(`ISO: 2026-10-18T14:30:45, Epoch: ${fixedDate.getTime()}`)
  })

  it('expands {{uuid}} to valid RFC 4122 v4 format', () => {
    const text = 'ID: {{uuid}}'
    const result = expandMacroTokens(text)
    const uuidMatch = result.match(/ID: ([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i)
    expect(uuidMatch).not.toBeNull()
  })

  it('inlines {{clipboard}} text safely', () => {
    const text = 'Template with: "{{clipboard}}"'
    const result = expandMacroTokens(text, { clipboardText: 'https://example.com/api' })
    expect(result).toBe('Template with: "https://example.com/api"')
  })

  it('preserves unknown tokens intact', () => {
    const text = 'Known: {{date}}, Unknown: {{custom_foo}}'
    const result = expandMacroTokens(text, { now: fixedDate })
    expect(result).toBe('Known: 2026-10-18, Unknown: {{custom_foo}}')
  })

  it('returns original text unchanged when no tokens exist', () => {
    const text = 'Plain text clip without any macros'
    expect(expandMacroTokens(text)).toBe(text)
  })
})
