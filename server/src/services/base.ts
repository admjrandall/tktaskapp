import { db } from '../db/index.js'
import { auditEvents } from '../db/schema/audit-events.js'
import { sql } from 'drizzle-orm'
import type * as schema from '../db/schema/index.js'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export type Tx = NodePgDatabase<typeof schema>

export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`)
    await tx.execute(sql`SET LOCAL app.org_id = ${tenantId}::uuid`)
    return fn(tx as unknown as Tx)
  })
}

export interface AuditEventInput {
  tenantId: string
  userId: string
  eventType: string
  resourceType?: string
  resourceId?: string
  details?: Record<string, unknown>
}

export async function writeAuditEvent(input: AuditEventInput): Promise<string> {
  const [event] = await db
    .insert(auditEvents)
    .values({
      orgId: input.tenantId as unknown as string, // orgId maps to tenantId
      userId: input.userId as unknown as string,
      action: input.eventType,
      resource: input.resourceType,
      outcome: 'success',
      metadata: input.details ?? null,
    })
    .returning({ id: auditEvents.id })

  return event?.id ?? ''
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export function paginationValues(params: PaginationParams): {
  limit: number
  offset: number
  page: number
  pageSize: number
} {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  return { limit: pageSize, offset: (page - 1) * pageSize, page, pageSize }
}
