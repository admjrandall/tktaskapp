import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock factories — must be declared before vi.mock() calls
const { mockExecute, mockInsert, mockSelect, mockTransaction } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue(undefined)
  const mockInsert = vi.fn()
  const mockSelect = vi.fn()

  const mockTx = {
    execute: mockExecute,
    insert: mockInsert,
    select: mockSelect,
  }
  const mockTransaction = vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx))

  return { mockExecute, mockInsert, mockSelect, mockTransaction }
})

vi.mock('../../../server/src/db/index.js', () => ({
  db: { transaction: mockTransaction },
}))

const { withTenant, paginationValues, writeAuditEvent } =
  await import('../../../server/src/services/base.js')

beforeEach(() => {
  vi.clearAllMocks()
  mockExecute.mockResolvedValue(undefined)
  mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: mockExecute, insert: mockInsert, select: mockSelect }),
  )
})

describe('withTenant', () => {
  it('calls db.transaction', async () => {
    const fn = vi.fn().mockResolvedValue('result')
    await withTenant('tenant-abc', fn)
    expect(mockTransaction).toHaveBeenCalledOnce()
  })

  it('sets app.tenant_id before calling fn', async () => {
    const callOrder: string[] = []
    mockExecute.mockImplementation(async () => {
      callOrder.push('execute')
    })
    const fn = vi.fn().mockImplementation(async () => {
      callOrder.push('fn')
      return 'done'
    })
    await withTenant('t-1', fn)
    expect(callOrder.indexOf('execute')).toBeLessThan(callOrder.indexOf('fn'))
  })

  it('returns the value from fn', async () => {
    const result = await withTenant('t-1', async () => 42)
    expect(result).toBe(42)
  })

  it('propagates errors from fn without swallowing them', async () => {
    await expect(
      withTenant('t-1', async () => {
        throw new Error('db error')
      }),
    ).rejects.toThrow('db error')
  })

  it('runs fn inside the transaction (fn receives the tx object)', async () => {
    let capturedTx: unknown = null
    await withTenant('t-1', async (tx) => {
      capturedTx = tx
    })
    expect(capturedTx).not.toBeNull()
    expect(capturedTx).toHaveProperty('execute')
  })
})

describe('paginationValues', () => {
  it('defaults to page=1, pageSize=20', () => {
    const r = paginationValues({})
    expect(r.page).toBe(1)
    expect(r.pageSize).toBe(20)
    expect(r.limit).toBe(20)
    expect(r.offset).toBe(0)
  })

  it('computes offset as (page - 1) * pageSize', () => {
    const r = paginationValues({ page: 3, pageSize: 10 })
    expect(r.offset).toBe(20)
  })

  it('clamps pageSize to 100 maximum', () => {
    const r = paginationValues({ pageSize: 500 })
    expect(r.pageSize).toBeLessThanOrEqual(100)
    expect(r.limit).toBeLessThanOrEqual(100)
  })

  it('clamps pageSize to 1 minimum', () => {
    const r = paginationValues({ pageSize: 0 })
    expect(r.pageSize).toBeGreaterThanOrEqual(1)
  })

  it('clamps page to 1 minimum', () => {
    const r = paginationValues({ page: -5 })
    expect(r.page).toBeGreaterThanOrEqual(1)
    expect(r.offset).toBeGreaterThanOrEqual(0)
  })
})

describe('writeAuditEvent', () => {
  it('calls db.transaction to write the event', async () => {
    const chainRow = { chainPosition: 5, signedDigest: 'prev-digest' }
    const insertedRow = { id: 'audit-event-1' }

    const mockOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([chainRow]) })
    const mockFrom2 = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: mockOrderBy }) })
    const mockSelect2 = vi.fn().mockReturnValue({ from: mockFrom2 })

    const mockReturning = vi.fn().mockResolvedValue([insertedRow])
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
    mockInsert.mockReturnValue({ values: mockValues })

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: mockExecute,
        insert: mockInsert,
        select: mockSelect2,
      }),
    )

    const id = await writeAuditEvent({
      tenantId: 'tenant-1',
      userId: 'user-1',
      eventType: 'session_start',
      resourceType: 'auth',
      resourceId: 'res-1',
    })

    expect(mockTransaction).toHaveBeenCalled()
    expect(typeof id).toBe('string')
  })

  it('returns the inserted event id', async () => {
    const insertedRow = { id: 'returned-audit-id' }

    const mockOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) })
    const mockFrom2 = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: mockOrderBy }) })
    const mockSelect2 = vi.fn().mockReturnValue({ from: mockFrom2 })

    const mockReturning = vi.fn().mockResolvedValue([insertedRow])
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
    mockInsert.mockReturnValue({ values: mockValues })

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: mockExecute,
        insert: mockInsert,
        select: mockSelect2,
      }),
    )

    const id = await writeAuditEvent({
      tenantId: 'tenant-1',
      userId: 'user-1',
      eventType: 'auth_success',
    })

    expect(id).toBe('returned-audit-id')
  })
})
