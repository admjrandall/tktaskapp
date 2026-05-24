import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAuthStateStore } from '../../server/src/auth/state-store.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('server auth state store', () => {
  it('consumes PKCE state exactly once in development memory mode', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('AUTH_STATE_REDIS_URL', '')
    const store = await getAuthStateStore()
    const state = `state-${crypto.randomUUID()}`

    await store.savePkceState(
      state,
      { codeVerifier: 'verifier', redirectTo: '/', expiresAt: Date.now() + 60_000 },
      60,
    )

    await expect(store.consumePkceState(state)).resolves.toMatchObject({
      codeVerifier: 'verifier',
    })
    await expect(store.consumePkceState(state)).resolves.toBeNull()
  })

  it('detects refresh token replay in development memory mode', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('AUTH_STATE_REDIS_URL', '')
    const store = await getAuthStateStore()
    const token = `refresh-${crypto.randomUUID()}`

    await expect(store.rememberRefreshTokenUse(token, 60)).resolves.toBe(true)
    await expect(store.rememberRefreshTokenUse(token, 60)).resolves.toBe(false)
  })

  it('fails closed in production without durable auth state', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_STATE_REDIS_URL', '')
    vi.stubEnv('AI_GATEWAY_REDIS_URL', '')

    await expect(getAuthStateStore()).rejects.toThrow('AUTH_STATE_REDIS_URL is required')
  })
})
