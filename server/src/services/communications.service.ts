import { db } from '../db/index.js'
import { communications } from '../db/schema/communications.js'
import { eq, and, isNull, count } from 'drizzle-orm'
import { withTenant, writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type { Communication, NewCommunication } from '../db/schema/communications.js'

export type CreateCommunicationInput = Omit<
  NewCommunication,
  'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>
export type UpdateCommunicationInput = Partial<Omit<CreateCommunicationInput, 'id'>>

export class CommunicationsService {
  async list(
    tenantId: string,
    filters: {
      relatedStore?: string
      relatedId?: string
      clientId?: string
      page?: number
      pageSize?: number
    },
  ): Promise<PaginatedResult<Communication>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(communications.deletedAt), eq(communications.tenantId, tenantId)]
      if (filters.relatedStore)
        conditions.push(eq(communications.relatedStore, filters.relatedStore))
      if (filters.relatedId) conditions.push(eq(communications.relatedId, filters.relatedId))
      if (filters.clientId) conditions.push(eq(communications.clientId, filters.clientId))
      const [rows, countRows] = await Promise.all([
        tx
          .select()
          .from(communications)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        tx
          .select({ value: count() })
          .from(communications)
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

  async getById(tenantId: string, id: string): Promise<Communication | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(communications)
        .where(
          and(
            eq(communications.id, id),
            eq(communications.tenantId, tenantId),
            isNull(communications.deletedAt),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(
    tenantId: string,
    userId: string,
    data: CreateCommunicationInput,
  ): Promise<Communication> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(communications)
        .values({ ...data, tenantId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'communication.created',
        resourceType: 'communications',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateCommunicationInput,
  ): Promise<Communication | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(communications)
        .set({ ...changes, updatedAt: new Date() })
        .where(
          and(
            eq(communications.id, id),
            eq(communications.tenantId, tenantId),
            isNull(communications.deletedAt),
          ),
        )
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'communication.updated',
        resourceType: 'communications',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(communications)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(communications.id, id),
            eq(communications.tenantId, tenantId),
            isNull(communications.deletedAt),
          ),
        )
        .returning({ id: communications.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'communication.deleted',
        resourceType: 'communications',
        resourceId: id,
      })
      return true
    })
  }
}

export const communicationsService = new CommunicationsService()
