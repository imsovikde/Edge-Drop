import { describe, expect, it } from 'vitest'
import { parseAnyFirebaseConfigInput } from '../electron/backup/firebaseConfig'
import { formatAuthError } from '../electron/backup/authManager'

describe('Firebase Config Universal Parser & Error Mapping', () => {
  it('parses raw JSON configuration', () => {
    const rawJson = JSON.stringify({
      apiKey: 'AIzaSyA1234567890abcdef',
      authDomain: 'custom-proj.firebaseapp.com',
      projectId: 'custom-proj',
      storageBucket: 'custom-proj.firebasestorage.app',
      messagingSenderId: '123456789',
      appId: '1:123456789:web:abcdef'
    })

    const parsed = parseAnyFirebaseConfigInput(rawJson)
    expect(parsed).not.toBeNull()
    expect(parsed?.apiKey).toBe('AIzaSyA1234567890abcdef')
    expect(parsed?.projectId).toBe('custom-proj')
    expect(parsed?.authDomain).toBe('custom-proj.firebaseapp.com')
    expect(parsed?.storageBucket).toBe('custom-proj.firebasestorage.app')
  })

  it('parses standard Firebase Console JavaScript snippet', () => {
    const jsSnippet = `
      // Import the functions you need from the SDKs you need
      import { initializeApp } from "firebase/app";

      const firebaseConfig = {
        apiKey: "AIzaSySnippetKey_987654321",
        authDomain: "my-snippet-app.firebaseapp.com",
        projectId: "my-snippet-app",
        storageBucket: "my-snippet-app.appspot.com",
        messagingSenderId: "9876543210",
        appId: "1:9876543210:web:987654321"
      };

      const app = initializeApp(firebaseConfig);
    `

    const parsed = parseAnyFirebaseConfigInput(jsSnippet)
    expect(parsed).not.toBeNull()
    expect(parsed?.apiKey).toBe('AIzaSySnippetKey_987654321')
    expect(parsed?.projectId).toBe('my-snippet-app')
    expect(parsed?.authDomain).toBe('my-snippet-app.firebaseapp.com')
    expect(parsed?.storageBucket).toBe('my-snippet-app.appspot.com')
  })

  it('parses .env key-value lines', () => {
    const envContent = `
      VITE_FIREBASE_API_KEY="AIzaSyEnvKey_11223344"
      VITE_FIREBASE_PROJECT_ID=env-project-42
      VITE_FIREBASE_AUTH_DOMAIN=env-project-42.firebaseapp.com
      VITE_FIREBASE_STORAGE_BUCKET=env-project-42.firebasestorage.app
    `

    const parsed = parseAnyFirebaseConfigInput(envContent)
    expect(parsed).not.toBeNull()
    expect(parsed?.apiKey).toBe('AIzaSyEnvKey_11223344')
    expect(parsed?.projectId).toBe('env-project-42')
    expect(parsed?.authDomain).toBe('env-project-42.firebaseapp.com')
  })

  it('rejects invalid or missing inputs cleanly', () => {
    expect(parseAnyFirebaseConfigInput('')).toBeNull()
    expect(parseAnyFirebaseConfigInput('random invalid string without keys')).toBeNull()
    expect(parseAnyFirebaseConfigInput('{"foo": "bar"}')).toBeNull()
  })

  it('maps known Firebase Auth error codes to user-friendly messages', () => {
    expect(formatAuthError('EMAIL_NOT_FOUND')).toBe('No account found with this email address.')
    expect(formatAuthError('INVALID_PASSWORD')).toBe('Incorrect password. Please verify and try again.')
    expect(formatAuthError('INVALID_LOGIN_CREDENTIALS')).toBe('Invalid email or password.')
    expect(formatAuthError('EMAIL_EXISTS')).toBe('An account with this email address already exists.')
    expect(formatAuthError('OPERATION_NOT_ALLOWED')).toBe('Email/Password sign-in is not enabled in Firebase Console.')
    expect(formatAuthError('TOO_MANY_ATTEMPTS_TRY_LATER')).toBe('Too many failed login attempts. Please try again later.')
    expect(formatAuthError('WEAK_PASSWORD')).toBe('Password should be at least 6 characters.')
    expect(formatAuthError('INVALID_EMAIL')).toBe('Please provide a valid email address.')
    expect(formatAuthError('NETWORK_REQUEST_FAILED')).toBe('Network connection failed. Check your internet connectivity.')
  })
})
