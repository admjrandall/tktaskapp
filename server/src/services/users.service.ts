import { db } from '../db/index.js'
import { tenantUsers } from '../db/schema/users.js'
import { eq, and, isNull, count } from 'drizzle-orm'
import { writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type { InferSelectModel } from 'drizzle-orm'

export type TenantUser = InferSelectModel<typeof tenantUsers>

export class UsersService {
  async list(
    tenantId: string,
    filters: { status?: string; page?: number; pageSize?: number },
  ): Promise<PaginatedResult<TenantUser>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    const conditions = [eq(tenantUsers.orgId, tenantId)]

    if (filters.status === 'active') conditions.push(isNull(tenantUsers.deletedAt))
    else if (filters.status === 'suspended') {
      // suspended is represented by deletedAt being set (soft delete used as suspend)
    }

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(tenantUsers)
        .where(and(...conditions))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(tenantUsers)
        .where(and(...conditions)),
    ])
    return {
      data: rows,
      pagination: {
        page,
        pageSize,
        total: countRows[0]?.value ?? 0,
        totalPages: Math.ceil((countRows[0]?.value ?? 0) / pageSize),
      },
    }
  }

  async getById(tenantId: string, id: string): Promise<TenantUser | null> {
    const rows = await db
      .select()
      .from(tenantUsers)
      .where(and(eq(tenantUsers.id, id), eq(tenantUsers.orgId, tenantId)))
      .limit(1)
    return rows[0] ?? null
  }

  async suspend(tenantId: string, requestedBy: string, userId: string): Promise<boolean> {
    const [row] = await db
      .update(tenantUsers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tenantUsers.id, userId), eq(tenantUsers.orgId, tenantId)))
      .returning({ id: tenantUsers.id })
    if (!row) return false
    await writeAuditEvent({
      tenantId,
      userId: requestedBy,
      eventType: 'user.suspended',
      resourceType: 'users',
      resourceId: userId,
      details: { targetUserId: userId },
    })
    return true
  }
}

export const usersService = new UsersService()
