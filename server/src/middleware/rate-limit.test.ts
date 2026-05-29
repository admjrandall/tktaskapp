import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import type { HonoEnv } from '../hono-types.js'
import { __resetRateLimitStateForTests, byUser, rateLimit } from './rate-limit.js'

/**
 * Unit tests for the HTTP rate-limit middleware (roadmap B1, #13). These exercise
 * the in-memory fallback path (no RATE_LIMIT_REDIS_URL set) with a deterministic
 * key resolver, so they are pure and DB/Redis-free.
 */

function appWith(limit: number, windowMs: number, key: string) {
  const app = new Hono<HonoEnv>()
  app.use('*', rateLimit({ name: 'test', limit, windowMs, keyResolver: () => key }))
  app.get('/', (c) => c.text('ok'))
  return app
}

beforeEach(() => {
  __resetRateLimitStateForTests()
  delete process.env['RATE_LIMIT_ENABLED']
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimit middleware', () => {
  it('allows requests under the limit and sets RateLimit headers', async () => {
    const app = appWith(3, 60_000, 'id-a')
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('RateLimit-Limit')).toBe('3')
    expect(res.headers.get('RateLimit-Remaining')).toBe('2')
    expect(Number(res.headers.get('RateLimit-Reset'))).toBeGreaterThan(0)
  })

  it('decrements remaining on each request', async () => {
    const app = appWith(3, 60_000, 'id-a')
    const r1 = await app.request('/')
    const r2 = await app.request('/')
    expect(r1.headers.get('RateLimit-Remaining')).toBe('2')
    expect(r2.headers.get('RateLimit-Remaining')).toBe('1')
  })

  it('returns 429 with Retry-After once the limit is exceeded', async () => {
    const app = appWith(2, 60_000, 'id-a')
    await app.request('/')
    await app.request('/')
    const blocked = await app.request('/')
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('RateLimit-Remaining')).toBe('0')
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(await blocked.json()).toEqual({ error: 'Too many requests' })
  })

  it('isolates counts across distinct identities', async () => {
    const appA = appWith(1, 60_000, 'id-a')
    const appB = appWith(1, 60_000, 'id-b')
    expect((await appA.request('/')).status).toBe(200)
    expect((await appA.request('/')).status).toBe(429)
    // Different identity, independent budget.
    expect((await appB.request('/')).status).toBe(200)
  })

  it('resets after the window elapses', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29T00:00:00Z'))
    const app = appWith(1, 1_000, 'id-a')
    expect((await app.request('/')).status).toBe(200)
    expect((await app.request('/')).status).toBe(429)
    vi.setSystemTime(new Date('2026-05-29T00:00:02Z')) // +2s, past the 1s window
    expect((await app.request('/')).status).toBe(200)
  })

  it('skips limiting when keyResolver returns undefined', async () => {
    const app = new Hono<HonoEnv>()
    app.use(
      '*',
      rateLimit({ name: 'test', limit: 1, windowMs: 60_000, keyResolver: () => undefined }),
    )
    app.get('/', (c) => c.text('ok'))
    expect((await app.request('/')).status).toBe(200)
    expect((await app.request('/')).status).toBe(200)
  })

  it('honours the skip predicate', async () => {
    const app = new Hono<HonoEnv>()
    app.use(
      '*',
      rateLimit({
        name: 'test',
        limit: 1,
        windowMs: 60_000,
        keyResolver: () => 'id-a',
        skip: (c) => c.req.path === '/healthz',
      }),
    )
    app.get('/healthz', (c) => c.text('ok'))
    expect((await app.request('/healthz')).status).toBe(200)
    expect((await app.request('/healthz')).status).toBe(200)
  })

  it('is disabled when RATE_LIMIT_ENABLED=false', async () => {
    process.env['RATE_LIMIT_ENABLED'] = 'false'
    const app = appWith(1, 60_000, 'id-a')
    expect((await app.request('/')).status).toBe(200)
    expect((await app.request('/')).status).toBe(200)
  })
})

describe('byUser key resolver', () => {
  it('keys on tenant + user when authenticated, IP otherwise', async () => {
    const app = new Hono<HonoEnv>()
    let resolved = ''
    const capture = async (c: Context<HonoEnv>, next: Next): Promise<void> => {
      if (c.req.path === '/auth-as-user') {
        c.set('userId', 'u1')
        c.set('tenantId', 't1')
      }
      resolved = byUser(c)
      await next()
    }
    app.use('*', capture)
    app.get('/auth-as-user', (c) => c.text('ok'))
    app.get('/anon', (c) => c.text('ok'))

    await app.request('/auth-as-user')
    expect(resolved).toBe('user:t1:u1')

    await app.request('/anon')
    expect(resolved.startsWith('ip:')).toBe(true)
  })
})
