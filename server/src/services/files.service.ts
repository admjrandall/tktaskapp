import { db } from '../db/index.js'
import { files } from '../db/schema/files.js'
import { eq, and, isNull, count } from 'drizzle-orm'
import { withTenant, writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type { File, NewFile } from '../db/schema/files.js'

export type CreateFileInput = Omit<NewFile, 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'>
export type UpdateFileInput = Partial<Omit<CreateFileInput, 'id'>>

export class FilesService {
  async list(
    tenantId: string,
    filters: { relatedStore?: string; relatedId?: string; page?: number; pageSize?: number },
  ): Promise<PaginatedResult<File>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(files.deletedAt), eq(files.tenantId, tenantId)]
      if (filters.relatedStore) conditions.push(eq(files.relatedStore, filters.relatedStore))
      if (filters.relatedId) conditions.push(eq(files.relatedId, filters.relatedId))
      const [rows, [{ value: total }]] = await Promise.all([
        (tx as typeof db)
          .select()
          .from(files)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        (tx as typeof db)
          .select({ value: count() })
          .from(files)
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

  async getById(tenantId: string, id: string): Promise<File | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await (tx as typeof db)
        .select()
        .from(files)
        .where(and(eq(files.id, id), eq(files.tenantId, tenantId), isNull(files.deletedAt)))
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(tenantId: string, userId: string, data: CreateFileInput): Promise<File> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .insert(files)
        .values({ ...data, tenantId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'file.created',
        resourceType: 'files',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateFileInput,
  ): Promise<File | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .update(files)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(files.id, id), eq(files.tenantId, tenantId), isNull(files.deletedAt)))
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'file.updated',
        resourceType: 'files',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await (tx as typeof db)
        .update(files)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(files.id, id), eq(files.tenantId, tenantId), isNull(files.deletedAt)))
        .returning({ id: files.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'file.deleted',
        resourceType: 'files',
        resourceId: id,
      })
      return true
    })
  }
}

export const filesService = new FilesService()
