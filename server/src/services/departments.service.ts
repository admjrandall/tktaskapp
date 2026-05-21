import { db } from '../db/index.js'
import { departments } from '../db/schema/departments.js'
import { eq, and, isNull, ilike, count } from 'drizzle-orm'
import { withTenant, writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type { Department, NewDepartment } from '../db/schema/departments.js'

export type CreateDepartmentInput = Omit<
  NewDepartment,
  'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>
export type UpdateDepartmentInput = Partial<Omit<CreateDepartmentInput, 'id'>>

export class DepartmentsService {
  async list(
    tenantId: string,
    filters: { search?: string; page?: number; pageSize?: number },
  ): Promise<PaginatedResult<Department>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(departments.deletedAt), eq(departments.tenantId, tenantId)]
      if (filters.search) conditions.push(ilike(departments.name, `%${filters.search}%`))
      const [rows, countRows] = await Promise.all([
        tx
          .select()
          .from(departments)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        tx
          .select({ value: count() })
          .from(departments)
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

  async getById(tenantId: string, id: string): Promise<Department | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(departments)
        .where(
          and(
            eq(departments.id, id),
            eq(departments.tenantId, tenantId),
            isNull(departments.deletedAt),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(tenantId: string, userId: string, data: CreateDepartmentInput): Promise<Department> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(departments)
        .values({ ...data, tenantId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'department.created',
        resourceType: 'departments',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateDepartmentInput,
  ): Promise<Department | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(departments)
        .set({ ...changes, updatedAt: new Date() })
        .where(
          and(
            eq(departments.id, id),
            eq(departments.tenantId, tenantId),
            isNull(departments.deletedAt),
          ),
        )
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'department.updated',
        resourceType: 'departments',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(departments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(departments.id, id),
            eq(departments.tenantId, tenantId),
            isNull(departments.deletedAt),
          ),
        )
        .returning({ id: departments.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'department.deleted',
        resourceType: 'departments',
        resourceId: id,
      })
      return true
    })
  }
}

export const departmentsService = new DepartmentsService()
