import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoist mock factories
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

const { mockIsUserOnHold, mockScheduleKeyDestruction } = vi.hoisted(() => ({
  mockIsUserOnHold: vi.fn().mockResolvedValue(false),
  mockScheduleKeyDestruction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../server/src/db/index.js', () => ({
  db: { transaction: mockTransaction },
}))

// Use a regular function so `new LegalHoldService()` works as a constructor
vi.mock('../../../server/src/kms/legal-hold.js', () => ({
  LegalHoldService: vi.fn(function (this: Record<string, unknown>) {
    this['isUserOnHold'] = mockIsUserOnHold
  }),
}))

vi.mock('../../../server/src/kms/key-service.js', () => ({
  AzureKeyVaultKeyService: vi.fn(function (this: Record<string, unknown>) {
    this['scheduleKeyDestruction'] = mockScheduleKeyDestruction
  }),
  LegalHoldActiveError: class LegalHoldActiveError extends Error {
    constructor(userId: string) {
      super(`Legal hold active for user ${userId}`)
      this.name = 'LegalHoldActiveError'
    }
  },
  getKmsService: vi.fn(),
}))

const { runErasureWorkflow } = await import('../../../server/src/kms/erasure-workflow.js')

const TENANT = 'tenant-erasure'
const USER = 'user-to-erase'
const REQUESTED_BY = 'admin-user'

function setupAuditMocks() {
  const mockOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) })
  const mockAuditWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
  const mockAuditFrom = vi.fn().mockReturnValue({ where: mockAuditWhere })
  mockSelect.mockReturnValue({ from: mockAuditFrom })

  const mockReturning = vi.fn().mockResolvedValue([{ id: 'audit-id' }])
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
  mockInsert.mockReturnValue({ values: mockValues })

  const mockUpdateReturning = vi.fn().mockResolvedValue([])
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning })
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
  mockUpdate.mockReturnValue({ set: mockUpdateSet })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExecute.mockResolvedValue(undefined)
  mockIsUserOnHold.mockResolvedValue(false)
  mockScheduleKeyDestruction.mockResolvedValue(undefined)
  mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: mockExecute, insert: mockInsert, update: mockUpdate, select: mockSelect }),
  )
})

describe('runErasureWorkflow()', () => {
  it('returns a scheduled result with userId, status, effectiveAt, and auditEventId', async () => {
    setupAuditMocks()
    const result = await runErasureWorkflow(USER, TENANT, REQUESTED_BY)
    expect(result.userId).toBe(USER)
    expect(result.status).toBe('scheduled')
    expect(result.effectiveAt).toBeInstanceOf(Date)
    expect(typeof result.auditEventId).toBe('string')
  })

  it('throws LegalHoldActiveError when user is on legal hold', async () => {
    mockIsUserOnHold.mockResolvedValue(true)
    await expect(runErasureWorkflow(USER, TENANT, REQUESTED_BY)).rejects.toThrow(
      /legal hold active/i,
    )
  })

  it('checks legal hold before KMS scheduling', async () => {
    const callOrder: string[] = []
    mockIsUserOnHold.mockImplementation(async () => {
      callOrder.push('isUserOnHold')
      return true
    })
    mockScheduleKeyDestruction.mockImplementation(async () => {
      callOrder.push('scheduleKeyDestruction')
    })

    await expect(runErasureWorkflow(USER, TENANT, REQUESTED_BY)).rejects.toThrow()
    expect(callOrder).toEqual(['isUserOnHold'])
    expect(callOrder).not.toContain('scheduleKeyDestruction')
  })

  it('schedules KMS key destruction when AZURE_KV_URL is set', async () => {
    const originalUrl = process.env['AZURE_KV_URL']
    process.env['AZURE_KV_URL'] = 'https://kv.vault.azure.net'
    setupAuditMocks()

    await runErasureWorkflow(USER, TENANT, REQUESTED_BY)

    expect(mockScheduleKeyDestruction).toHaveBeenCalledWith(USER, TENANT, expect.any(Date))
    process.env['AZURE_KV_URL'] = originalUrl
  })

  it('skips KMS scheduling when AZURE_KV_URL is unset', async () => {
    const originalUrl = process.env['AZURE_KV_URL']
    delete process.env['AZURE_KV_URL']
    setupAuditMocks()

    await runErasureWorkflow(USER, TENANT, REQUESTED_BY)

    expect(mockScheduleKeyDestruction).not.toHaveBeenCalled()
    process.env['AZURE_KV_URL'] = originalUrl
  })

  it('audit event details include keyDestructionScheduledAt and keyDestroyedAt=null (S-3)', async () => {
    let capturedMetadata: Record<string, unknown> | undefined

    const mockReturning = vi.fn().mockResolvedValue([{ id: 'audit-id' }])
    const mockValues = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
      if (vals && typeof vals === 'object' && 'metadata' in vals) {
        capturedMetadata = vals['metadata'] as Record<string, unknown>
      }
      return { returning: mockReturning }
    })
    mockInsert.mockReturnValue({ values: mockValues })

    const mockOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) })
    const mockAuditWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
    const mockAuditFrom = vi.fn().mockReturnValue({ where: mockAuditWhere })
    mockSelect.mockReturnValue({ from: mockAuditFrom })

    const mockUpdateReturning = vi.fn().mockResolvedValue([])
    const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning })
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
    mockUpdate.mockReturnValue({ set: mockUpdateSet })

    await runErasureWorkflow(USER, TENANT, REQUESTED_BY)

    expect(capturedMetadata).toBeDefined()
    expect(capturedMetadata).toHaveProperty('keyDestructionScheduledAt')
    expect(capturedMetadata).toHaveProperty('keyDestroyedAt', null)
    expect(typeof capturedMetadata?.['keyDestructionScheduledAt']).toBe('string')
  })

  it('soft-deletes records via withTenant (update is called for each entity)', async () => {
    setupAuditMocks()
    await runErasureWorkflow(USER, TENANT, REQUESTED_BY)
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('audit event references the erased userId in resourceId', async () => {
    let capturedValues: Record<string, unknown> | undefined

    const mockReturning = vi.fn().mockResolvedValue([{ id: 'audit-id' }])
    const mockValues = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
      capturedValues = vals
      return { returning: mockReturning }
    })
    mockInsert.mockReturnValue({ values: mockValues })

    const mockOrderBy = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) })
    const mockAuditWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
    const mockAuditFrom = vi.fn().mockReturnValue({ where: mockAuditWhere })
    mockSelect.mockReturnValue({ from: mockAuditFrom })

    const mockUpdateReturning = vi.fn().mockResolvedValue([])
    const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning })
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
    mockUpdate.mockReturnValue({ set: mockUpdateSet })

    await runErasureWorkflow(USER, TENANT, REQUESTED_BY)

    // resourceId is stored inside metadata (storedMetadata includes resourceId)
    const metadata = capturedValues?.['metadata'] as Record<string, unknown> | undefined
    expect(metadata?.['resourceId']).toBe(USER)
    expect(capturedValues?.['action']).toBe('gdpr_erasure_requested')
  })
})
