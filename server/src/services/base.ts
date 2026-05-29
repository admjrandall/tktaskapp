import { db } from '../db/index.js'
import { auditEvents } from '../db/schema/audit-events.js'
import { desc, eq, sql } from 'drizzle-orm'
import type * as schema from '../db/schema/index.js'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { createHash } from 'node:crypto'

export type Tx = NodePgDatabase<typeof schema>

export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`)
    await tx.execute(sql`SET LOCAL app.org_id = ${tenantId}::uuid`)
    return fn(tx)
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
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.tenant_id = ${input.tenantId}`)
    await tx.execute(sql`SET LOCAL app.org_id = ${input.tenantId}::uuid`)

    const [previous] = await tx
      .select({
        chainPosition: auditEvents.chainPosition,
        signedDigest: auditEvents.signedDigest,
      })
      .from(auditEvents)
      .where(eq(auditEvents.orgId, input.tenantId))
      .orderBy(desc(auditEvents.chainPosition))
      .limit(1)

    const chainPosition = (previous?.chainPosition ?? 0) + 1
    const prevHash = previous?.signedDigest ?? null
    const metadata = input.details ?? null
    const storedMetadata: Record<string, unknown> = {
      ...(metadata ?? {}),
      resourceId: input.resourceId,
    }
    const digestPayload: Record<string, unknown> = {
      action: input.eventType,
      chainPosition,
      metadata: storedMetadata,
      orgId: input.tenantId,
      outcome: 'success',
      prevHash,
      resource: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      userId: input.userId,
    }
    const signedDigest = computeAuditDigest(digestPayload)

    const [event] = await tx
      .insert(auditEvents)
      .values({
        orgId: input.tenantId,
        userId: input.userId,
        action: input.eventType,
        resource: input.resourceType,
        outcome: 'success',
        metadata: storedMetadata,
        chainPosition,
        prevHash,
        signedDigest,
      })
      .returning({ id: auditEvents.id })

    return event?.id ?? ''
  })
}

export function verifyAuditChain(
  events: Array<{
    orgId: string
    userId: string | null
    action: string
    resource: string | null
    outcome: string
    metadata: unknown
    chainPosition: number
    prevHash: string | null
    signedDigest: string | null
  }>,
): boolean {
  let prevHash: string | null = null
  for (const event of [...events].sort((a, b) => a.chainPosition - b.chainPosition)) {
    if (event.prevHash !== prevHash || !event.signedDigest) return false
    const metadata =
      event.metadata && typeof event.metadata === 'object'
        ? _withoutUndefined(event.metadata as Record<string, unknown>)
        : event.metadata
    const digestPayload: Record<string, unknown> = {
      action: event.action,
      chainPosition: event.chainPosition,
      metadata,
      orgId: event.orgId,
      outcome: event.outcome,
      prevHash,
      resource: event.resource,
      resourceId:
        metadata && typeof metadata === 'object'
          ? ((metadata as Record<string, unknown>)['resourceId'] ?? null)
          : null,
      userId: event.userId,
    }
    const expected: string = computeAuditDigest(digestPayload)
    if (expected !== event.signedDigest) return false
    prevHash = event.signedDigest
  }
  return true
}

/**
 * Compute the SHA-256 hex digest of an audit event payload using the canonical
 * JSON encoding. This is the single authoritative implementation shared by
 * `writeAuditEvent` (when sealing a new event) and `verifyAuditChain` (when
 * re-deriving the expected digest). Exported so the hash-chain integrity logic
 * can be unit-tested without a live database.
 */
export function computeAuditDigest(payload: Record<string, unknown>): string {
  return createHash('sha256').update(_canonicalJson(payload)).digest('hex')
}

function _canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((v) => _canonicalJson(v)).join(',')}]`
  const obj = _withoutUndefined(value as Record<string, unknown>)
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${_canonicalJson(obj[key])}`)
    .join(',')}}`
}

function _withoutUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined))
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
