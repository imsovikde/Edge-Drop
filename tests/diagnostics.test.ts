import { describe, expect, it, vi } from 'vitest'
import { getSystemDiagnostics } from '../electron/main/diagnostics'

describe('System Diagnostics Generator', () => {
  it('generates a formatted markdown diagnostics report with system and app telemetry', () => {
    const report = getSystemDiagnostics()
    expect(report).toContain('### Environment & System Diagnostics')
    expect(report).toContain('**Edge-Drop Version**')
    expect(report).toContain('**Platform / OS**')
    expect(report).toContain('**Electron / Chromium / Node**')
    expect(report).toContain('**Shelf Placement**')
    expect(report).toContain('**Continuous Cloud Sync**')
    expect(report).toContain('**Cloud Sync Status**')
    expect(report).toContain('**Auth Status**')
    expect(report).toContain('### Description of Bug / Behavior')
  })
})
