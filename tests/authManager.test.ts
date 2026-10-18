import { describe, expect, it, vi } from 'vitest'
import { toUserDto } from '../electron/backup/authManager'
import type { User } from 'firebase/auth'

describe('AuthManager User DTO & Session Handling', () => {
  it('converts Firebase User object to secure client-safe FirebaseUserDto', () => {
    const mockUser = {
      uid: 'user-uid-12345',
      email: 'user@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.png',
      isAnonymous: false,
      providerData: [{ providerId: 'google.com' }]
    } as unknown as User

    const dto = toUserDto(mockUser)
    expect(dto).toEqual({
      uid: 'user-uid-12345',
      email: 'user@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.png',
      isAnonymous: false,
      providerId: 'google.com'
    })
  })

  it('handles null User cleanly by returning null', () => {
    const dto = toUserDto(null)
    expect(dto).toBeNull()
  })

  it('handles anonymous user with fallback providerId', () => {
    const mockAnonUser = {
      uid: 'anon-uid-999',
      email: null,
      displayName: null,
      photoURL: null,
      isAnonymous: true,
      providerData: []
    } as unknown as User

    const dto = toUserDto(mockAnonUser)
    expect(dto).toEqual({
      uid: 'anon-uid-999',
      email: null,
      displayName: null,
      photoURL: null,
      isAnonymous: true,
      providerId: 'firebase'
    })
  })

  it('preserves emailVerified boolean when present on User', () => {
    const verifiedUser = {
      uid: 'verified-1',
      email: 'verified@example.com',
      displayName: 'Verified',
      photoURL: null,
      isAnonymous: false,
      providerData: [],
      emailVerified: true
    } as unknown as User

    const dto = toUserDto(verifiedUser)
    expect(dto?.emailVerified).toBe(true)

    const unverifiedUser = {
      ...verifiedUser,
      uid: 'unverified-2',
      emailVerified: false
    } as unknown as User
    const unverifiedDto = toUserDto(unverifiedUser)
    expect(unverifiedDto?.emailVerified).toBe(false)
  })

  it('formats Firebase auth error codes into helpful user messages', async () => {
    const { formatAuthError } = await import('../electron/backup/authManager')
    expect(formatAuthError('EMAIL_NOT_FOUND')).toContain('No account found')
    expect(formatAuthError('INVALID_PASSWORD')).toContain('Incorrect password')
    expect(formatAuthError('INVALID_LOGIN_CREDENTIALS')).toContain('Invalid email or password')
    expect(formatAuthError('EMAIL_EXISTS')).toContain('already exists')
    expect(formatAuthError('TOO_MANY_ATTEMPTS_TRY_LATER')).toContain('Too many failed login attempts')
  })

  it('rejects password reset with invalid or empty email', async () => {
    const { authManager } = await import('../electron/backup/authManager')
    const res = await authManager.sendPasswordResetEmail('')
    expect(res.ok).toBe(false)
    expect(res.message).toContain('valid email address')
  })

  it('returns appropriate response when checking email verification on guest/unauthenticated session', async () => {
    const { authManager } = await import('../electron/backup/authManager')
    const res = await authManager.checkEmailVerification()
    expect(res.verified).toBe(false)
    expect(res.message).toContain('No registered user session found')
  })
})
