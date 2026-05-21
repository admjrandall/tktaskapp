import { db } from '../db/index.js'
import { people } from '../db/schema/people.js'
import { eq, and, isNull, ilike, count } from 'drizzle-orm'
import { withTenant, writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type { Person, NewPerson } from '../db/schema/people.js'

export type CreatePersonInput = Omit<
  NewPerson,
  'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>
export type UpdatePersonInput = Partial<Omit<CreatePersonInput, 'id'>>

export class PeopleService {
  async list(
    tenantId: string,
    filters: {
      search?: string
      clientId?: string
      departmentId?: string
      page?: number
      pageSize?: number
    },
  ): Promise<PaginatedResult<Person>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(people.deletedAt), eq(people.tenantId, tenantId)]
      if (filters.search) conditions.push(ilike(people.name, `%${filters.search}%`))
      if (filters.clientId) conditions.push(eq(people.clientId, filters.clientId))
      if (filters.departmentId) conditions.push(eq(people.departmentId, filters.departmentId))
      const [rows, [{ value: total }]] = await Promise.all([
        (tx as typeof db)
          .select()
          .from(people)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        (tx as typeof db)
          .select({ value: count() })
          .from(people)
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

  async getById(tenantId: string, id: string): Promise<Person | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await (tx as typeof db)
        .select()
        .from(people)
        .where(and(eq(people.id, id), eq(people.tenantId, tenantId), isNull(people.deletedAt)))
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(tenantId: string, userId: string, data: CreatePersonInput): Promise<Person> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .insert(people)
        .values({ ...data, tenantId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'person.created',
        resourceType: 'people',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdatePersonInput,
  ): Promise<Person | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .update(people)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(people.id, id), eq(people.tenantId, tenantId), isNull(people.deletedAt)))
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'person.updated',
        resourceType: 'people',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .update(people)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(people.id, id), eq(people.tenantId, tenantId), isNull(people.deletedAt)))
        .returning({ id: people.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'person.deleted',
        resourceType: 'people',
        resourceId: id,
      })
      return true
    })
  }
}

export const peopleService = new PeopleService()
