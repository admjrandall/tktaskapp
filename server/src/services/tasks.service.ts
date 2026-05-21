import { db } from '../db/index.js'
import { tasks } from '../db/schema/tasks.js'
import { eq, and, isNull, ilike, count, lte, lt, ne } from 'drizzle-orm'
import { withTenant, writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type { Task, NewTask } from '../db/schema/tasks.js'

export type CreateTaskInput = Omit<NewTask, 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'>
export type UpdateTaskInput = Partial<Omit<CreateTaskInput, 'id'>>

export class TasksService {
  async list(
    tenantId: string,
    filters: {
      search?: string
      projectId?: string
      status?: string
      priority?: string
      assigneeId?: string
      overdue?: boolean
      dueToday?: boolean
      page?: number
      pageSize?: number
    },
  ): Promise<PaginatedResult<Task>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(tasks.deletedAt), eq(tasks.tenantId, tenantId)]
      if (filters.search) conditions.push(ilike(tasks.title, `%${filters.search}%`))
      if (filters.projectId) conditions.push(eq(tasks.projectId, filters.projectId))
      if (filters.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId))
      if (filters.overdue) {
        const today = new Date().toISOString().slice(0, 10)
        conditions.push(lt(tasks.dueDate, today))
        conditions.push(ne(tasks.status, 'Done' as never))
      }
      if (filters.dueToday) {
        const today = new Date().toISOString().slice(0, 10)
        conditions.push(eq(tasks.dueDate, today))
      }
      const [rows, [{ value: total }]] = await Promise.all([
        (tx as typeof db)
          .select()
          .from(tasks)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        (tx as typeof db)
          .select({ value: count() })
          .from(tasks)
          .where(and(...conditions)),
      ])
      return {
        data: rows,
        pagination: {
          page,
          pageSize,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / pageSize),
        },
      }
    })
  }

  async getById(tenantId: string, id: string): Promise<Task | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await (tx as typeof db)
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId), isNull(tasks.deletedAt)))
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(tenantId: string, userId: string, data: CreateTaskInput): Promise<Task> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .insert(tasks)
        .values({ ...data, tenantId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'task.created',
        resourceType: 'tasks',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateTaskInput,
  ): Promise<Task | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .update(tasks)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId), isNull(tasks.deletedAt)))
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'task.updated',
        resourceType: 'tasks',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .update(tasks)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId), isNull(tasks.deletedAt)))
        .returning({ id: tasks.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'task.deleted',
        resourceType: 'tasks',
        resourceId: id,
      })
      return true
    })
  }
}

export const tasksService = new TasksService()
