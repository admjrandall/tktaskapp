import { describe, expect, it } from 'vitest'
import { verifyAuditChain } from '../../server/src/services/base.js'
import { createHash } from 'node:crypto'

function digest(event: {
  orgId: string
  userId: string
  action: string
  resource: string
  outcome: string
  metadata: Record<string, unknown>
  chainPosition: number
  prevHash: string | null
}): string {
  const payload = {
    action: event.action,
    chainPosition: event.chainPosition,
    metadata: event.metadata,
    orgId: event.orgId,
    outcome: event.outcome,
    prevHash: event.prevHash,
    resource: event.resource,
    resourceId: event.metadata['resourceId'] ?? null,
    userId: event.userId,
  }
  return createHash('sha256').update(canonicalJson(payload)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`
  const obj = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined),
  )
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`)
    .join(',')}}`
}

describe('server audit chain verification', () => {
  it('detects a tampered audit event', () => {
    const first = {
      orgId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      action: 'client.create',
      resource: 'clients',
      outcome: 'success',
      metadata: { resourceId: 'client-1' },
      chainPosition: 1,
      prevHash: null,
      signedDigest: '',
    }
    first.signedDigest = digest(first)

    const tampered = { ...first, action: 'client.delete' }

    expect(verifyAuditChain([first])).toBe(true)
    expect(verifyAuditChain([tampered])).toBe(false)
  })
})
