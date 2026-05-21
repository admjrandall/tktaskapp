import { db } from '../db/index.js'
import { tags } from '../db/schema/tags.js'
import { eq, and, isNull, ilike, count } from 'drizzle-orm'
import { withTenant, writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type { Tag, NewTag } from '../db/schema/tags.js'

export type CreateTagInput = Omit<NewTag, 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'>
export type UpdateTagInput = Partial<Omit<CreateTagInput, 'id'>>

export class TagsService {
  async list(
    tenantId: string,
    filters: { search?: string; page?: number; pageSize?: number },
  ): Promise<PaginatedResult<Tag>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(tags.deletedAt), eq(tags.tenantId, tenantId)]
      if (filters.search) conditions.push(ilike(tags.name, `%${filters.search}%`))
      const [rows, countRows] = await Promise.all([
        tx
          .select()
          .from(tags)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        tx
          .select({ value: count() })
          .from(tags)
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

  async getById(tenantId: string, id: string): Promise<Tag | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(tags)
        .where(and(eq(tags.id, id), eq(tags.tenantId, tenantId), isNull(tags.deletedAt)))
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(tenantId: string, userId: string, data: CreateTagInput): Promise<Tag> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(tags)
        .values({ ...data, tenantId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'tag.created',
        resourceType: 'tags',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateTagInput,
  ): Promise<Tag | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(tags)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(tags.id, id), eq(tags.tenantId, tenantId), isNull(tags.deletedAt)))
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'tag.updated',
        resourceType: 'tags',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(tags)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(tags.id, id), eq(tags.tenantId, tenantId), isNull(tags.deletedAt)))
        .returning({ id: tags.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'tag.deleted',
        resourceType: 'tags',
        resourceId: id,
      })
      return true
    })
  }
}

export const tagsService = new TagsService()
