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
})
