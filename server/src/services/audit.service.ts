import { db } from '../db/index.js'
import { auditEvents } from '../db/schema/audit-events.js'
import { eq, and, gte, lte, count } from 'drizzle-orm'
import { paginationValues, type PaginatedResult } from './base.js'
import type { InferSelectModel } from 'drizzle-orm'

export type AuditEvent = InferSelectModel<typeof auditEvents>

export class AuditService {
  async list(
    tenantId: string,
    filters: {
      eventType?: string
      userId?: string
      resourceType?: string
      resourceId?: string
      from?: string
      to?: string
      page?: number
      pageSize?: number
    },
  ): Promise<PaginatedResult<AuditEvent>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    const conditions = [eq(auditEvents.orgId, tenantId as unknown as string)]
    if (filters.eventType) conditions.push(eq(auditEvents.action, filters.eventType))
    if (filters.userId) conditions.push(eq(auditEvents.userId, filters.userId as unknown as string))
    if (filters.resourceType) conditions.push(eq(auditEvents.resource, filters.resourceType))
    if (filters.from) conditions.push(gte(auditEvents.createdAt, new Date(filters.from)))
    if (filters.to) conditions.push(lte(auditEvents.createdAt, new Date(filters.to)))

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(auditEvents)
        .where(and(...conditions))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(auditEvents)
        .where(and(...conditions)),
    ])
    return {
      data: rows,
      pagination: {
        page,
        pageSize,
        total: Number(countRows[0]?.value ?? 0),
        totalPages: Math.ceil(Number(countRows[0]?.value ?? 0) / pageSize),
      },
    }
  }

  async exportNdjson(tenantId: string, from?: string, to?: string): Promise<string> {
    const conditions = [eq(auditEvents.orgId, tenantId as unknown as string)]
    if (from) conditions.push(gte(auditEvents.createdAt, new Date(from)))
    if (to) conditions.push(lte(auditEvents.createdAt, new Date(to)))
    const rows = await db
      .select()
      .from(auditEvents)
      .where(and(...conditions))
    return rows.map((r) => JSON.stringify(r)).join('\n')
  }

  async exportCsv(tenantId: string, from?: string, to?: string): Promise<string> {
    const conditions = [eq(auditEvents.orgId, tenantId as unknown as string)]
    if (from) conditions.push(gte(auditEvents.createdAt, new Date(from)))
    if (to) conditions.push(lte(auditEvents.createdAt, new Date(to)))
    const rows = await db
      .select()
      .from(auditEvents)
      .where(and(...conditions))
    if (rows.length === 0) return ''
    const headers = Object.keys(rows[0] ?? {}).join(',')
    const lines = rows.map((r) =>
      Object.values(r)
        .map((v) => (v === null || v === undefined ? '' : JSON.stringify(v)))
        .join(','),
    )
    return [headers, ...lines].join('\n')
  }
}

export const auditService = new AuditService()
