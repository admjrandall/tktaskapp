import { db } from '../db/index.js'
import { documents } from '../db/schema/documents.js'
import { eq, and, isNull, ilike, count } from 'drizzle-orm'
import { withTenant, writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type { Document, NewDocument } from '../db/schema/documents.js'

export type CreateDocumentInput = Omit<
  NewDocument,
  'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>
export type UpdateDocumentInput = Partial<Omit<CreateDocumentInput, 'id'>>

export class DocumentsService {
  async list(
    tenantId: string,
    filters: {
      search?: string
      linkedStore?: string
      linkedId?: string
      page?: number
      pageSize?: number
    },
  ): Promise<PaginatedResult<Document>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(documents.deletedAt), eq(documents.tenantId, tenantId)]
      if (filters.search) conditions.push(ilike(documents.title, `%${filters.search}%`))
      if (filters.linkedStore) conditions.push(eq(documents.linkedStore, filters.linkedStore))
      if (filters.linkedId) conditions.push(eq(documents.linkedId, filters.linkedId))
      const [rows, [{ value: total }]] = await Promise.all([
        (tx as typeof db)
          .select()
          .from(documents)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        (tx as typeof db)
          .select({ value: count() })
          .from(documents)
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

  async getById(tenantId: string, id: string): Promise<Document | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await (tx as typeof db)
        .select()
        .from(documents)
        .where(
          and(eq(documents.id, id), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)),
        )
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(tenantId: string, userId: string, data: CreateDocumentInput): Promise<Document> {
    const excerpt = data.body?.slice(0, 200) ?? null
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .insert(documents)
        .values({ ...data, tenantId, excerpt, createdBy: userId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'document.created',
        resourceType: 'documents',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateDocumentInput,
  ): Promise<Document | null> {
    const excerpt = changes.body !== undefined ? (changes.body?.slice(0, 200) ?? null) : undefined
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .update(documents)
        .set({ ...changes, ...(excerpt !== undefined ? { excerpt } : {}), updatedAt: new Date() })
        .where(
          and(eq(documents.id, id), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)),
        )
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'document.updated',
        resourceType: 'documents',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .update(documents)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(documents.id, id), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)),
        )
        .returning({ id: documents.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'document.deleted',
        resourceType: 'documents',
        resourceId: id,
      })
      return true
    })
  }
}

export const documentsService = new DocumentsService()
