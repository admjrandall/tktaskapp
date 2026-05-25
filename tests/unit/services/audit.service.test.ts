import { describe, it, expect, vi, beforeEach } from 'vitest'

// Vitest hoists vi.mock factories — all mock vars must be via vi.hoisted()
const { mockExecute, mockInsert, mockSelect, mockTransaction } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue(undefined)
  const mockInsert = vi.fn()
  const mockSelect = vi.fn()
  const mockTx = { execute: mockExecute, insert: mockInsert, select: mockSelect }
  const mockTransaction = vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx))
  return { mockExecute, mockInsert, mockSelect, mockTransaction }
})

vi.mock('../../../server/src/db/index.js', () => ({
  db: { transaction: mockTransaction },
}))

const { AuditService } = await import('../../../server/src/services/audit.service.js')
const { writeAuditEvent, verifyAuditChain } = await import('../../../server/src/services/base.js')

const service = new AuditService()
const TENANT = 'tenant-audit'

function setupListChain(rows: unknown[], total = rows.length) {
  const mockOffset = vi.fn().mockResolvedValue(rows)
  const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  const mockCountWhere = vi.fn().mockResolvedValue([{ value: total }])
  const mockCountFrom = vi.fn().mockReturnValue({ where: mockCountWhere })

  let callCount = 0
  mockSelect.mockImplementation(() => {
    callCount++
    return callCount === 1 ? { from: mockFrom } : { from: mockCountFrom }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExecute.mockResolvedValue(undefined)
  mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: mockExecute, insert: mockInsert, select: mockSelect }),
  )
})

describe('AuditService.list()', () => {
  it('returns paginated audit events', async () => {
    const event = {
      id: 'ev-1',
      orgId: TENANT,
      userId: 'user-1',
      action: 'session_start',
      resource: null,
      outcome: 'success',
      metadata: null,
      chainPosition: 1,
      prevHash: null,
      signedDigest: 'abc',
      createdAt: new Date(),
    }
    setupListChain([event], 1)

    const result = await service.list(TENANT, {})
    expect(result.data).toHaveLength(1)
    expect(result.pagination.total).toBe(1)
  })

  it('applies pagination defaults (page=1, pageSize=20)', async () => {
    setupListChain([])
    const result = await service.list(TENANT, {})
    expect(result.pagination.page).toBe(1)
    expect(result.pagination.pageSize).toBe(20)
  })

  it('returns empty data when no events match', async () => {
    setupListChain([], 0)
    const result = await service.list(TENANT, { eventType: 'nonexistent_event' })
    expect(result.data).toHaveLength(0)
    expect(result.pagination.total).toBe(0)
  })
})

describe('AuditService.exportNdjson()', () => {
  it('returns newline-delimited JSON for each event', async () => {
    const event = { id: 'ev-1', action: 'auth_success', orgId: TENANT }
    const mockWhere = vi.fn().mockResolvedValue([event])
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    const result = await service.exportNdjson(TENANT)
    expect(result).toContain('"id":"ev-1"')
    expect(result.split('\n')).toHaveLength(1)
  })

  it('returns empty string for zero events', async () => {
    const mockWhere = vi.fn().mockResolvedValue([])
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    const result = await service.exportNdjson(TENANT)
    expect(result).toBe('')
  })
})

describe('AuditService.exportCsv()', () => {
  it('returns CSV with headers for non-empty audit log', async () => {
    const event = { id: 'ev-1', action: 'auth_success', orgId: TENANT, outcome: 'success' }
    const mockWhere = vi.fn().mockResolvedValue([event])
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    const result = await service.exportCsv(TENANT)
    expect(result).toContain('id')
    expect(result).toContain('action')
    const lines = result.split('\n')
    expect(lines.length).toBeGreaterThan(1)
  })

  it('returns empty string for zero events', async () => {
    const mockWhere = vi.fn().mockResolvedValue([])
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    const result = await service.exportCsv(TENANT)
    expect(result).toBe('')
  })
})

describe('writeAuditEvent — append-only invariant', () => {
  it('only calls INSERT, never UPDATE (append-only audit trail)', async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: 'audit-1' }])
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
    mockInsert.mockReturnValue({ values: mockValues })

    const mockOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) })
    const mockAuditWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
    const mockAuditFrom = vi.fn().mockReturnValue({ where: mockAuditWhere })
    mockSelect.mockReturnValue({ from: mockAuditFrom })

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        execute: mockExecute,
        insert: mockInsert,
        select: mockSelect,
        update: vi.fn().mockImplementation(() => {
          throw new Error('UPDATE is not permitted on audit_events')
        }),
      }
      return fn(fakeTx)
    })

    // writeAuditEvent must succeed (only inserts)
    await expect(
      writeAuditEvent({
        tenantId: TENANT,
        userId: 'user-1',
        eventType: 'session_start',
      }),
    ).resolves.toBeDefined()
  })
})

describe('verifyAuditChain()', () => {
  it('returns true for an empty chain', () => {
    expect(verifyAuditChain([])).toBe(true)
  })

  it('returns true for a correctly-chained single event', () => {
    const { createHash } = require('node:crypto')
    const event = {
      orgId: TENANT,
      userId: 'user-1',
      action: 'session_start',
      resource: null,
      outcome: 'success',
      metadata: null,
      chainPosition: 1,
      prevHash: null,
      signedDigest: null as string | null,
    }
    const digestPayload = {
      action: event.action,
      chainPosition: 1,
      metadata: null,
      orgId: TENANT,
      outcome: 'success',
      prevHash: null,
      resource: null,
      resourceId: null,
      userId: 'user-1',
    }
    const sorted = JSON.stringify(
      Object.fromEntries(Object.entries(digestPayload).sort(([a], [b]) => a.localeCompare(b))),
    )
    event.signedDigest = createHash('sha256').update(sorted).digest('hex')
    expect(verifyAuditChain([event])).toBe(true)
  })

  it('returns false when signedDigest is null', () => {
    const event = {
      orgId: TENANT,
      userId: 'u1',
      action: 'session_start',
      resource: null,
      outcome: 'success',
      metadata: null,
      chainPosition: 1,
      prevHash: null,
      signedDigest: null,
    }
    expect(verifyAuditChain([event])).toBe(false)
  })

  it('returns false when prevHash does not match prior event signedDigest', () => {
    const makeEvent = (pos: number, prev: string | null, digest: string) => ({
      orgId: TENANT,
      userId: 'u1',
      action: 'session_start',
      resource: null,
      outcome: 'success',
      metadata: null,
      chainPosition: pos,
      prevHash: prev,
      signedDigest: digest,
    })
    const events = [makeEvent(1, null, 'digest-1'), makeEvent(2, 'wrong-digest', 'digest-2')]
    expect(verifyAuditChain(events)).toBe(false)
  })
})
