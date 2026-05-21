import { db } from '../db/index.js'
import { notifications } from '../db/schema/notifications.js'
import { eq, and, isNull, count } from 'drizzle-orm'
import { withTenant, writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type { Notification, NewNotification } from '../db/schema/notifications.js'

export type CreateNotificationInput = Omit<
  NewNotification,
  'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>
export type UpdateNotificationInput = Partial<Omit<CreateNotificationInput, 'id'>>

export class NotificationsService {
  async list(
    tenantId: string,
    filters: { userId?: string; read?: boolean; page?: number; pageSize?: number },
  ): Promise<PaginatedResult<Notification>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(notifications.deletedAt), eq(notifications.tenantId, tenantId)]
      if (filters.userId) conditions.push(eq(notifications.userId, filters.userId))
      if (filters.read !== undefined) conditions.push(eq(notifications.read, filters.read))
      const [rows, countRows] = await Promise.all([
        tx
          .select()
          .from(notifications)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        tx
          .select({ value: count() })
          .from(notifications)
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
    })
  }

  async getById(tenantId: string, id: string): Promise<Notification | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.tenantId, tenantId),
            isNull(notifications.deletedAt),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(
    tenantId: string,
    userId: string,
    data: CreateNotificationInput,
  ): Promise<Notification> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(notifications)
        .values({ ...data, tenantId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'notification.created',
        resourceType: 'notifications',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateNotificationInput,
  ): Promise<Notification | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(notifications)
        .set({ ...changes, updatedAt: new Date() })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.tenantId, tenantId),
            isNull(notifications.deletedAt),
          ),
        )
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'notification.updated',
        resourceType: 'notifications',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(notifications)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.tenantId, tenantId),
            isNull(notifications.deletedAt),
          ),
        )
        .returning({ id: notifications.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'notification.deleted',
        resourceType: 'notifications',
        resourceId: id,
      })
      return true
    })
  }
}

export const notificationsService = new NotificationsService()
