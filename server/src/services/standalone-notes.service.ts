import { standaloneNotes } from '../db/schema/standalone-notes.js'
import { eq, and, isNull, count } from 'drizzle-orm'
import { withTenant, writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type { StandaloneNote, NewStandaloneNote } from '../db/schema/standalone-notes.js'

export type CreateNoteInput = Omit<
  NewStandaloneNote,
  'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>
export type UpdateNoteInput = Partial<Omit<CreateNoteInput, 'id'>>

export class StandaloneNotesService {
  async list(
    tenantId: string,
    filters: {
      clientId?: string
      projectId?: string
      taskId?: string
      personId?: string
      page?: number
      pageSize?: number
    },
  ): Promise<PaginatedResult<StandaloneNote>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(standaloneNotes.deletedAt), eq(standaloneNotes.tenantId, tenantId)]
      if (filters.clientId) conditions.push(eq(standaloneNotes.clientId, filters.clientId))
      if (filters.projectId) conditions.push(eq(standaloneNotes.projectId, filters.projectId))
      if (filters.taskId) conditions.push(eq(standaloneNotes.taskId, filters.taskId))
      if (filters.personId) conditions.push(eq(standaloneNotes.personId, filters.personId))
      const [rows, countRows] = await Promise.all([
        tx
          .select()
          .from(standaloneNotes)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        tx
          .select({ value: count() })
          .from(standaloneNotes)
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

  async getById(tenantId: string, id: string): Promise<StandaloneNote | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(standaloneNotes)
        .where(
          and(
            eq(standaloneNotes.id, id),
            eq(standaloneNotes.tenantId, tenantId),
            isNull(standaloneNotes.deletedAt),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(tenantId: string, userId: string, data: CreateNoteInput): Promise<StandaloneNote> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(standaloneNotes)
        .values({ ...data, tenantId, createdBy: data.createdBy ?? userId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'note.created',
        resourceType: 'standaloneNotes',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateNoteInput,
  ): Promise<StandaloneNote | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(standaloneNotes)
        .set({ ...changes, updatedAt: new Date() })
        .where(
          and(
            eq(standaloneNotes.id, id),
            eq(standaloneNotes.tenantId, tenantId),
            isNull(standaloneNotes.deletedAt),
          ),
        )
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'note.updated',
        resourceType: 'standaloneNotes',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(standaloneNotes)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(standaloneNotes.id, id),
            eq(standaloneNotes.tenantId, tenantId),
            isNull(standaloneNotes.deletedAt),
          ),
        )
        .returning({ id: standaloneNotes.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'note.deleted',
        resourceType: 'standaloneNotes',
        resourceId: id,
      })
      return true
    })
  }
}

export const standaloneNotesService = new StandaloneNotesService()
