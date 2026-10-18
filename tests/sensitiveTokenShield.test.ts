import { describe, it, expect } from 'vitest'
import { detectSensitiveToken, maskToken } from '../src/lib/securityDetector'

describe('Sensitive Token Shield Engine', () => {
  it('detects OpenAI secret keys', () => {
    const text = 'Here is my OpenAI key: sk-proj-1234567890abcdefghijklmnopqrstuvwxyz_ABC'
    const result = detectSensitiveToken(text)
    expect(result.isSensitive).toBe(true)
    expect(result.tokenType).toBe('OpenAI API Key')
    expect(result.matchedToken).toBe('sk-proj-1234567890abcdefghijklmnopqrstuvwxyz_ABC')
    expect(result.maskedText).toContain('sk-pro••••••••••••••••_ABC')
  })

  it('detects Anthropic secret keys', () => {
    const text = 'export ANTHROPIC_API_KEY="sk-ant-api03-abcdef1234567890abcdef1234567890abcdef12-XYZ"'
    const result = detectSensitiveToken(text)
    expect(result.isSensitive).toBe(true)
    expect(result.tokenType).toBe('Anthropic API Key')
    expect(result.maskedText).toContain('sk-ant••••••••••••••••-XYZ')
  })

  it('detects GitHub Personal Access Tokens', () => {
    const text = 'ghp_1234567890abcdefghijklmnopqrstuvwx'
    const result = detectSensitiveToken(text)
    expect(result.isSensitive).toBe(true)
    expect(result.tokenType).toBe('GitHub Token')
    expect(result.maskedText).toContain('ghp_12••••••••••••••••uvwx')
  })

  it('detects AWS Access Key IDs', () => {
    const text = 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE'
    const result = detectSensitiveToken(text)
    expect(result.isSensitive).toBe(true)
    expect(result.tokenType).toBe('AWS Access Key')
    expect(result.maskedText).toContain('AKIAIO••••••••••••••••MPLE')
  })

  it('detects JSON Web Tokens (JWT)', () => {
    const text = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const result = detectSensitiveToken(text)
    expect(result.isSensitive).toBe(true)
    expect(result.tokenType).toBe('JSON Web Token')
  })

  it('detects Private Cryptographic Keys', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Y...\n-----END RSA PRIVATE KEY-----'
    const result = detectSensitiveToken(text)
    expect(result.isSensitive).toBe(true)
    expect(result.tokenType).toBe('Private Key')
    expect(result.maskedText).toBe('-----BEGIN RSA PRIVATE KEY----- [MASKED PRIVATE KEY] -----END RSA PRIVATE KEY-----')
  })

  it('does not falsely flag normal text or code snippets', () => {
    const text = 'const sum = (a: number, b: number) => a + b;\nconsole.log(sum(5, 10));'
    const result = detectSensitiveToken(text)
    expect(result.isSensitive).toBe(false)
    expect(result.tokenType).toBeNull()
    expect(result.maskedText).toBe(text)
  })

  it('maskToken helper formats tokens correctly', () => {
    const masked = maskToken('12345678901234567890')
    expect(masked).toBe('123456••••••••••••••••7890')
  })
})
