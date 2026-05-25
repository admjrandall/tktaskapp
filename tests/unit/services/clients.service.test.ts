import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock factories
const { mockExecute, mockInsert, mockSelect, mockTransaction, mockUpdate, mockDelete } = vi.hoisted(
  () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined)
    const mockInsert = vi.fn()
    const mockUpdate = vi.fn()
    const mockDelete = vi.fn()
    const mockSelect = vi.fn()

    const mockTx = {
      execute: mockExecute,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      select: mockSelect,
    }
    const mockTransaction = vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx))
    return { mockExecute, mockInsert, mockSelect, mockTransaction, mockUpdate, mockDelete }
  },
)

vi.mock('../../../server/src/db/index.js', () => ({
  db: { transaction: mockTransaction },
}))

const { ClientsService } = await import('../../../server/src/services/clients.service.js')

const service = new ClientsService()

const TENANT = 'tenant-test'
const USER = 'user-test'

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'client-1',
    tenantId: TENANT,
    name: 'Acme Corp',
    stage: 'Active',
    industry: null,
    website: null,
    notes: null,
    primaryContactId: null,
    ownerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }
}

function setupSelectChain(rows: unknown[]) {
  const mockOffset = vi.fn().mockResolvedValue(rows)
  const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  mockSelect.mockReturnValue({ from: mockFrom })
  return { mockLimit, mockOffset, mockWhere, mockFrom }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExecute.mockResolvedValue(undefined)
  mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      execute: mockExecute,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      select: mockSelect,
    }),
  )
})

describe('ClientsService.list()', () => {
  it('returns paginated clients', async () => {
    const row = makeClient()
    const mockOffset = vi.fn().mockResolvedValue([row])
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    // count query
    const mockCountWhere = vi.fn().mockResolvedValue([{ value: 1 }])
    const mockCountFrom = vi.fn().mockReturnValue({ where: mockCountWhere })

    let callCount = 0
    mockSelect.mockImplementation(() => {
      callCount++
      return callCount === 1 ? { from: mockFrom } : { from: mockCountFrom }
    })

    const result = await service.list(TENANT, {})
    expect(result.data).toHaveLength(1)
    expect(result.pagination.page).toBe(1)
  })

  it('applies pagination defaults (page=1, pageSize=20)', async () => {
    setupSelectChain([])
    const result = await service.list(TENANT, {})
    expect(result.pagination.page).toBe(1)
    expect(result.pagination.pageSize).toBe(20)
  })
})

describe('ClientsService.getById()', () => {
  it('returns the client when found', async () => {
    const row = makeClient()
    const mockLimit = vi.fn().mockResolvedValue([row])
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    const result = await service.getById(TENANT, 'client-1')
    expect(result).not.toBeNull()
    expect(result?.id).toBe('client-1')
  })

  it('returns null when not found', async () => {
    const mockLimit = vi.fn().mockResolvedValue([])
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    const result = await service.getById(TENANT, 'nonexistent')
    expect(result).toBeNull()
  })
})

describe('ClientsService.create()', () => {
  it('inserts a new client and returns it', async () => {
    const row = makeClient()
    const mockReturning = vi.fn().mockResolvedValue([row])
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
    mockInsert.mockReturnValue({ values: mockValues })

    // writeAuditEvent also calls select + insert — mock select for audit chain lookup
    const mockAuditOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) })
    const mockAuditWhere = vi.fn().mockReturnValue({ orderBy: mockAuditOrderBy })
    const mockAuditFrom = vi.fn().mockReturnValue({ where: mockAuditWhere })
    mockSelect.mockReturnValue({ from: mockAuditFrom })

    const result = await service.create(TENANT, USER, { name: 'Acme Corp', stage: 'Active' })
    expect(result.id).toBe('client-1')
    expect(mockInsert).toHaveBeenCalled()
  })

  it('throws if insert returns no rows', async () => {
    const mockReturning = vi.fn().mockResolvedValue([])
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
    mockInsert.mockReturnValue({ values: mockValues })

    const mockAuditOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) })
    const mockAuditWhere = vi.fn().mockReturnValue({ orderBy: mockAuditOrderBy })
    const mockAuditFrom = vi.fn().mockReturnValue({ where: mockAuditWhere })
    mockSelect.mockReturnValue({ from: mockAuditFrom })

    await expect(service.create(TENANT, USER, { name: 'Bad', stage: 'Active' })).rejects.toThrow()
  })
})

describe('ClientsService.update()', () => {
  it('updates a client and returns updated row', async () => {
    const updated = makeClient({ name: 'Updated Corp' })
    const mockReturning = vi.fn().mockResolvedValue([updated])
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
    mockUpdate.mockReturnValue({ set: mockSet })

    // audit select chain
    const mockAuditOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) })
    const mockAuditWhere = vi.fn().mockReturnValue({ orderBy: mockAuditOrderBy })
    const mockAuditFrom = vi.fn().mockReturnValue({ where: mockAuditWhere })
    mockSelect.mockReturnValue({ from: mockAuditFrom })

    const auditReturning = vi.fn().mockResolvedValue([{ id: 'audit-1' }])
    const auditValues = vi.fn().mockReturnValue({ returning: auditReturning })
    let insertCallCount = 0
    mockInsert.mockImplementation(() => {
      insertCallCount++
      return { values: auditValues }
    })

    const result = await service.update(TENANT, USER, 'client-1', { name: 'Updated Corp' })
    expect(result?.name).toBe('Updated Corp')
  })
})
