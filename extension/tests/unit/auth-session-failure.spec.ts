import { describe, expect, it } from 'vitest'

import { isAuthSessionFailure } from '../../src/core/api/auth/sessionFailure'
import { ApiError } from '../../src/core/api/client/types'

describe('auth session failure classifier', () => {
  it('keeps auth state for network and server errors', () => {
    expect(isAuthSessionFailure(new TypeError('Failed to fetch'))).toBe(false)
    expect(isAuthSessionFailure(new ApiError('server unavailable', 503))).toBe(false)
  })

  it('clears auth state for explicit auth failures', () => {
    expect(isAuthSessionFailure(new ApiError('token expired', 401, 10013))).toBe(true)
    expect(isAuthSessionFailure(new ApiError('token revoked', 200, 10014))).toBe(true)
  })

  it('keeps auth state when a 401 came from transient refresh failure', () => {
    const error = new ApiError('access token expired', 401, 10013)
    error.preserveAuthState = true

    expect(isAuthSessionFailure(error)).toBe(false)
  })
})
