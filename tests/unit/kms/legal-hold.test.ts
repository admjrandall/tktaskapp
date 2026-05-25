import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoist mock factories — real LegalHoldService, mocked DB
// ---------------------------------------------------------------------------
const { mockExecute, mockInsert, mockSelect, mockTransaction, mockUpdate } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue(undefined)
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockSelect = vi.fn()
  const mockTx = {
    execute: mockExecute,
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  }
  const mockTransaction = vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx))
  return { mockExecute, mockInsert, mockSelect, mockTransaction, mockUpdate }
})

vi.mock('../../../server/src/db/index.js', () => ({
  db: { transaction: mockTransaction },
}))

const { LegalHoldService } = await import('../../../server/src/kms/legal-hold.js')

const service = new LegalHoldService()
const TENANT = 'tenant-legalhold'
const USER = 'user-legalhold'

beforeEach(() => {
  vi.clearAllMocks()
  mockExecute.mockResolvedValue(undefined)
  mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: mockExecute, insert: mockInsert, update: mockUpdate, select: mockSelect }),
  )
})

describe('LegalHoldService.placeHold()', () => {
  it('returns a UUID string', async () => {
    const mockReturning = vi.fn().mockResolvedValue([])
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
    mockInsert.mockReturnValue({ values: mockValues })

    const id = await service.placeHold(USER, TENANT, 'litigation hold')
    expect(typeof id).toBe('string')
    expect(id).toHaveLength(36)
    // UUID v4 pattern
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('calls insert with the correct fields', async () => {
    const capturedValues: Record<string, unknown>[] = []
    const mockReturning = vi.fn().mockResolvedValue([])
    const mockValues = vi.fn().mockImplementation((v: Record<string, unknown>) => {
      capturedValues.push(v)
      return { returning: mockReturning }
    })
    mockInsert.mockReturnValue({ values: mockValues })

    await service.placeHold(USER, TENANT, 'litigation hold', undefined, 'admin-1')

    expect(capturedValues[0]).toMatchObject({
      userId: USER,
      tenantId: TENANT,
      reason: 'litigation hold',
      placedBy: 'admin-1',
    })
    expect(capturedValues[0]?.['expiresAt']).toBeNull()
  })

  it('sets expiresAt when provided', async () => {
    const capturedValues: Record<string, unknown>[] = []
    const mockReturning = vi.fn().mockResolvedValue([])
    const mockValues = vi.fn().mockImplementation((v: Record<string, unknown>) => {
      capturedValues.push(v)
      return { returning: mockReturning }
    })
    mockInsert.mockReturnValue({ values: mockValues })

    const expiresAt = new Date(Date.now() + 86400000)
    await service.placeHold(USER, TENANT, 'temporary hold', expiresAt)

    expect(capturedValues[0]?.['expiresAt']).toEqual(expiresAt)
  })
})

describe('LegalHoldService.liftHold()', () => {
  it('resolves without throwing', async () => {
    const mockReturning = vi.fn().mockResolvedValue([])
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
    mockUpdate.mockReturnValue({ set: mockSet })

    await expect(service.liftHold(TENANT, 'hold-id', 'admin')).resolves.toBeUndefined()
  })

  it('calls update with liftedAt and liftedBy fields', async () => {
    const capturedSet: Record<string, unknown>[] = []
    const mockReturning = vi.fn().mockResolvedValue([])
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
    const mockSet = vi.fn().mockImplementation((v: Record<string, unknown>) => {
      capturedSet.push(v)
      return { where: mockWhere }
    })
    mockUpdate.mockReturnValue({ set: mockSet })

    await service.liftHold(TENANT, 'hold-id', 'admin-user')

    expect(capturedSet[0]).toMatchObject({ liftedBy: 'admin-user' })
    expect(capturedSet[0]?.['liftedAt']).toBeInstanceOf(Date)
  })
})

describe('LegalHoldService.isUserOnHold()', () => {
  it('returns false when no active holds exist', async () => {
    const mockLimit = vi.fn().mockResolvedValue([])
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    expect(await service.isUserOnHold(TENANT, USER)).toBe(false)
  })

  it('returns true when an active hold row exists', async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: 'hold-1' }])
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    expect(await service.isUserOnHold(TENANT, USER)).toBe(true)
  })

  it('returns false for a different userId with no hold', async () => {
    const mockLimit = vi.fn().mockResolvedValue([])
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    expect(await service.isUserOnHold(TENANT, 'other-user')).toBe(false)
  })
})
