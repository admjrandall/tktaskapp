import { timeEntries } from '../db/schema/time-entries.js'
import { eq, and, isNull, count, or, lt, desc } from 'drizzle-orm'
import {
  withTenant,
  writeAuditEvent,
  paginationValues,
  cursorValues,
  encodeCursor,
  type PaginatedResult,
  type CursorPaginatedResult,
} from './base.js'
import type { TimeEntry, NewTimeEntry } from '../db/schema/time-entries.js'

export type CreateTimeEntryInput = Omit<
  NewTimeEntry,
  'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>
export type UpdateTimeEntryInput = Partial<Omit<CreateTimeEntryInput, 'id'>>

export class TimeEntriesService {
  async list(
    tenantId: string,
    filters: { taskId?: string; userId?: string; page?: number; pageSize?: number },
  ): Promise<PaginatedResult<TimeEntry>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(timeEntries.deletedAt), eq(timeEntries.tenantId, tenantId)]
      if (filters.taskId) conditions.push(eq(timeEntries.taskId, filters.taskId))
      if (filters.userId) conditions.push(eq(timeEntries.userId, filters.userId))
      const [rows, countRows] = await Promise.all([
        tx
          .select()
          .from(timeEntries)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        tx
          .select({ value: count() })
          .from(timeEntries)
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
    })
  }

  async listCursor(
    tenantId: string,
    filters: { taskId?: string; userId?: string; cursor?: string; pageSize?: number },
  ): Promise<CursorPaginatedResult<TimeEntry>> {
    const { limit, pageSize, cursor } = cursorValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(timeEntries.deletedAt), eq(timeEntries.tenantId, tenantId)]
      if (filters.taskId) conditions.push(eq(timeEntries.taskId, filters.taskId))
      if (filters.userId) conditions.push(eq(timeEntries.userId, filters.userId))
      if (cursor) {
        const cond = or(
          lt(timeEntries.createdAt, new Date(cursor.at)),
          and(eq(timeEntries.createdAt, new Date(cursor.at)), lt(timeEntries.id, cursor.id)),
        )
        if (cond) conditions.push(cond)
      }
      const rows = await tx
        .select()
        .from(timeEntries)
        .where(and(...conditions))
        .orderBy(desc(timeEntries.createdAt), desc(timeEntries.id))
        .limit(limit)
      const hasMore = rows.length > pageSize
      const data = hasMore ? rows.slice(0, pageSize) : rows
      const last = data.at(-1)
      return {
        data,
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
        hasMore,
      }
    })
  }

  async getById(tenantId: string, id: string): Promise<TimeEntry | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.id, id),
            eq(timeEntries.tenantId, tenantId),
            isNull(timeEntries.deletedAt),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(tenantId: string, userId: string, data: CreateTimeEntryInput): Promise<TimeEntry> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(timeEntries)
        .values({ ...data, tenantId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'time_entry.created',
        resourceType: 'timeEntries',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateTimeEntryInput,
  ): Promise<TimeEntry | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(timeEntries)
        .set({ ...changes, updatedAt: new Date() })
        .where(
          and(
            eq(timeEntries.id, id),
            eq(timeEntries.tenantId, tenantId),
            isNull(timeEntries.deletedAt),
          ),
        )
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'time_entry.updated',
        resourceType: 'timeEntries',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(timeEntries)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(timeEntries.id, id),
            eq(timeEntries.tenantId, tenantId),
            isNull(timeEntries.deletedAt),
          ),
        )
        .returning({ id: timeEntries.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'time_entry.deleted',
        resourceType: 'timeEntries',
        resourceId: id,
      })
      return true
    })
  }
}

export const timeEntriesService = new TimeEntriesService()
