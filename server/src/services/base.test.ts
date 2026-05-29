import { describe, expect, it } from 'vitest'
import { computeAuditDigest, verifyAuditChain } from './base.js'

/**
 * Expanded edge-case coverage for the audit hash chain, complementing the
 * existing tests:
 *   - `tests/security/server-audit-chain.test.ts` (single tamper-detection case)
 *   - `tests/unit/services/base.service.test.ts` (withTenant, paginationValues,
 *     writeAuditEvent — all mocked)
 *
 * This file adds the chain cases those do not cover (reorder tolerance, broken
 * link, skipped middle event, missing digest, non-null first prevHash) and
 * exercises the newly-extracted `computeAuditDigest` export directly. All cases
 * are pure / DB-free. Integration coverage of `withTenant()` RLS isolation
 * against a real database lives in `tests/security/server-rls-coverage.test.ts`,
 * which is skipped unless `POSTGRES_TEST_URL` is set (see ENTERPRISE-ROADMAP.md
 * item P0-3: wire that DB into CI).
 */

type ChainEvent = {
  orgId: string
  userId: string | null
  action: string
  resource: string | null
  outcome: string
  metadata: unknown
  chainPosition: number
  prevHash: string | null
  signedDigest: string | null
}

/**
 * Seal a single event by re-deriving its digest exactly the way
 * `verifyAuditChain` does. The crypto itself is the authoritative shared
 * implementation (`computeAuditDigest`); only the payload field layout is
 * mirrored here. If that layout drifts from production, these tests fail loudly
 * rather than passing silently.
 */
function seal(event: Omit<ChainEvent, 'signedDigest'>): ChainEvent {
  const metadata =
    event.metadata && typeof event.metadata === 'object'
      ? Object.fromEntries(
          Object.entries(event.metadata as Record<string, unknown>).filter(
            ([, v]) => v !== undefined,
          ),
        )
      : event.metadata
  const payload: Record<string, unknown> = {
    action: event.action,
    chainPosition: event.chainPosition,
    metadata,
    orgId: event.orgId,
    outcome: event.outcome,
    prevHash: event.prevHash,
    resource: event.resource,
    resourceId:
      metadata && typeof metadata === 'object'
        ? ((metadata as Record<string, unknown>)['resourceId'] ?? null)
        : null,
    userId: event.userId,
  }
  return { ...event, signedDigest: computeAuditDigest(payload) }
}

/** Indexed access that throws on out-of-bounds, avoiding non-null assertions. */
function at<T>(arr: T[], i: number): T {
  const v = arr[i]
  if (v === undefined) throw new RangeError(`index ${i} out of bounds`)
  return v
}

/** Build a correctly hash-linked chain from a list of partial events. */
function buildChain(partials: Array<Partial<ChainEvent> & { action: string }>): ChainEvent[] {
  const chain: ChainEvent[] = []
  let prevHash: string | null = null
  partials.forEach((p, i) => {
    const sealed = seal({
      orgId: p.orgId ?? 'org-1',
      userId: p.userId ?? 'user-1',
      action: p.action,
      resource: p.resource ?? null,
      outcome: p.outcome ?? 'success',
      metadata: p.metadata ?? { resourceId: `res-${i}` },
      chainPosition: p.chainPosition ?? i + 1,
      prevHash,
    })
    chain.push(sealed)
    prevHash = sealed.signedDigest
  })
  return chain
}

describe('verifyAuditChain', () => {
  it('accepts an empty chain', () => {
    expect(verifyAuditChain([])).toBe(true)
  })

  it('accepts a single sealed event', () => {
    expect(verifyAuditChain(buildChain([{ action: 'client.create' }]))).toBe(true)
  })

  it('accepts a valid multi-event chain', () => {
    const chain = buildChain([
      { action: 'client.create' },
      { action: 'client.update' },
      { action: 'client.delete' },
    ])
    expect(verifyAuditChain(chain)).toBe(true)
  })

  it('validates regardless of input ordering (it sorts by chainPosition)', () => {
    const chain = buildChain([{ action: 'a' }, { action: 'b' }, { action: 'c' }])
    const shuffled = [at(chain, 2), at(chain, 0), at(chain, 1)]
    expect(verifyAuditChain(shuffled)).toBe(true)
  })

  it('rejects a tampered action field', () => {
    const chain = buildChain([{ action: 'a' }, { action: 'b' }, { action: 'c' }])
    chain[1] = { ...at(chain, 1), action: 'forged.action' }
    expect(verifyAuditChain(chain)).toBe(false)
  })

  it('rejects tampered metadata', () => {
    const chain = buildChain([{ action: 'a' }, { action: 'b' }])
    chain[1] = { ...at(chain, 1), metadata: { resourceId: 'res-1', injected: 'evil' } }
    expect(verifyAuditChain(chain)).toBe(false)
  })

  it('rejects a tampered outcome', () => {
    const chain = buildChain([{ action: 'a', outcome: 'success' }])
    chain[0] = { ...at(chain, 0), outcome: 'failure' }
    expect(verifyAuditChain(chain)).toBe(false)
  })

  it('rejects a broken prevHash link', () => {
    const chain = buildChain([{ action: 'a' }, { action: 'b' }])
    chain[1] = { ...at(chain, 1), prevHash: 'deadbeef' }
    expect(verifyAuditChain(chain)).toBe(false)
  })

  it('rejects a first event whose prevHash is not null', () => {
    const chain = buildChain([{ action: 'a' }])
    chain[0] = { ...at(chain, 0), prevHash: 'should-be-null' }
    expect(verifyAuditChain(chain)).toBe(false)
  })

  it('rejects an event missing its signed digest', () => {
    const chain = buildChain([{ action: 'a' }])
    chain[0] = { ...at(chain, 0), signedDigest: null }
    expect(verifyAuditChain(chain)).toBe(false)
  })

  it('rejects a deleted (skipped) middle event', () => {
    const chain = buildChain([{ action: 'a' }, { action: 'b' }, { action: 'c' }])
    // Drop the middle event: the third event's prevHash no longer matches.
    expect(verifyAuditChain([at(chain, 0), at(chain, 2)])).toBe(false)
  })
})

describe('computeAuditDigest', () => {
  it('is deterministic and key-order independent (canonical JSON)', () => {
    const a = computeAuditDigest({ b: 2, a: 1, nested: { y: 1, x: 2 } })
    const b = computeAuditDigest({ a: 1, nested: { x: 2, y: 1 }, b: 2 })
    expect(a).toBe(b)
  })

  it('produces a 64-char hex SHA-256 digest', () => {
    expect(computeAuditDigest({ action: 'x' })).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when any field changes', () => {
    const base = computeAuditDigest({ action: 'a', chainPosition: 1 })
    expect(computeAuditDigest({ action: 'a', chainPosition: 2 })).not.toBe(base)
  })
})
