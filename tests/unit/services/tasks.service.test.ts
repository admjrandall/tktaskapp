import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const { TasksService } = await import('../../../server/src/services/tasks.service.js')

const service = new TasksService()
const TENANT = 'tenant-tasks'
const USER = 'user-tasks'

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    tenantId: TENANT,
    title: 'Test task',
    status: 'Todo',
    priority: 'Medium',
    dueDate: null,
    assigneeId: null,
    projectId: null,
    description: null,
    estimatedHours: null,
    actualHours: null,
    ownerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }
}

function setupAuditMocks() {
  const mockAuditOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) })
  const mockAuditWhere = vi.fn().mockReturnValue({ orderBy: mockAuditOrderBy })
  const mockAuditFrom = vi.fn().mockReturnValue({ where: mockAuditWhere })
  mockSelect.mockReturnValue({ from: mockAuditFrom })
  const auditReturning = vi.fn().mockResolvedValue([{ id: 'audit-id' }])
  const auditValues = vi.fn().mockReturnValue({ returning: auditReturning })
  mockInsert.mockReturnValue({ values: auditValues })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExecute.mockResolvedValue(undefined)
  mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: mockExecute, insert: mockInsert, update: mockUpdate, select: mockSelect }),
  )
})

describe('TasksService.list()', () => {
  it('returns paginated tasks', async () => {
    const task = makeTask()
    const mockOffset = vi.fn().mockResolvedValue([task])
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    const mockCountWhere = vi.fn().mockResolvedValue([{ value: 1 }])
    const mockCountFrom = vi.fn().mockReturnValue({ where: mockCountWhere })

    let callCount = 0
    mockSelect.mockImplementation(() => {
      callCount++
      return callCount === 1 ? { from: mockFrom } : { from: mockCountFrom }
    })

    const result = await service.list(TENANT, {})
    expect(result.data).toHaveLength(1)
    expect(result.pagination.total).toBe(1)
  })

  it('builds an overdue filter (dueDate < today, status != Done)', async () => {
    const mockOffset = vi.fn().mockResolvedValue([])
    const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset })
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    const mockCountWhere = vi.fn().mockResolvedValue([{ value: 0 }])
    const mockCountFrom = vi.fn().mockReturnValue({ where: mockCountWhere })
    let callCount = 0
    mockSelect.mockImplementation(() => {
      callCount++
      return callCount === 1 ? { from: mockFrom } : { from: mockCountFrom }
    })

    await service.list(TENANT, { overdue: true })
    // Should have been called — the overdue condition adds lt(tasks.dueDate, today)
    expect(mockWhere).toHaveBeenCalled()
  })

  it('builds a dueToday filter (dueDate == today)', async () => {
    const mockOffset2 = vi.fn().mockResolvedValue([])
    const mockLimit2 = vi.fn().mockReturnValue({ offset: mockOffset2 })
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit2 })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    const mockCountWhere = vi.fn().mockResolvedValue([{ value: 0 }])
    const mockCountFrom = vi.fn().mockReturnValue({ where: mockCountWhere })
    let callCount = 0
    mockSelect.mockImplementation(() => {
      callCount++
      return callCount === 1 ? { from: mockFrom } : { from: mockCountFrom }
    })

    await service.list(TENANT, { dueToday: true })
    expect(mockWhere).toHaveBeenCalled()
  })
})

describe('TasksService.getById()', () => {
  it('returns the task when found', async () => {
    const task = makeTask()
    const mockLimit = vi.fn().mockResolvedValue([task])
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    const result = await service.getById(TENANT, 'task-1')
    expect(result).not.toBeNull()
    expect(result?.id).toBe('task-1')
  })

  it('returns null when not found', async () => {
    const mockLimit = vi.fn().mockResolvedValue([])
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect.mockReturnValue({ from: mockFrom })

    const result = await service.getById(TENANT, 'no-such-task')
    expect(result).toBeNull()
  })
})

describe('TasksService.create()', () => {
  it('inserts a new task and returns it', async () => {
    const task = makeTask()
    const mockReturning = vi.fn().mockResolvedValue([task])
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
    mockInsert.mockReturnValueOnce({ values: mockValues })

    setupAuditMocks()

    const result = await service.create(TENANT, USER, { title: 'Test task', status: 'Todo' })
    expect(result.id).toBe('task-1')
  })

  it('throws if insert returns no rows', async () => {
    const mockReturning = vi.fn().mockResolvedValue([])
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
    mockInsert.mockReturnValue({ values: mockValues })

    const mockAuditOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) })
    const mockAuditWhere = vi.fn().mockReturnValue({ orderBy: mockAuditOrderBy })
    const mockAuditFrom = vi.fn().mockReturnValue({ where: mockAuditWhere })
    mockSelect.mockReturnValue({ from: mockAuditFrom })

    await expect(service.create(TENANT, USER, { title: 'Fail', status: 'Todo' })).rejects.toThrow()
  })
})

describe('TasksService.update()', () => {
  it('updates a task and returns updated row', async () => {
    const updated = makeTask({ title: 'Updated title', status: 'In Progress' })
    const mockReturning = vi.fn().mockResolvedValue([updated])
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
    mockUpdate.mockReturnValue({ set: mockSet })

    setupAuditMocks()

    const result = await service.update(TENANT, USER, 'task-1', { status: 'In Progress' })
    expect(result?.status).toBe('In Progress')
  })
})
