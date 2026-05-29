import { clients } from '../db/schema/clients.js'
import { eq, and, isNull, ilike, count, or, lt, desc } from 'drizzle-orm'
import {
  withTenant,
  writeAuditEvent,
  paginationValues,
  cursorValues,
  encodeCursor,
  type PaginatedResult,
  type CursorPaginatedResult,
} from './base.js'
import type { Client, NewClient } from '../db/schema/clients.js'

export type CreateClientInput = Omit<
  NewClient,
  'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>
export type UpdateClientInput = Partial<Omit<CreateClientInput, 'id'>>

export class ClientsService {
  async list(
    tenantId: string,
    filters: { search?: string; stage?: string; page?: number; pageSize?: number },
  ): Promise<PaginatedResult<Client>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)

    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(clients.deletedAt), eq(clients.tenantId, tenantId)]
      if (filters.search) conditions.push(ilike(clients.name, `%${filters.search}%`))

      const [rows, countRows] = await Promise.all([
        tx
          .select()
          .from(clients)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        tx
          .select({ value: count() })
          .from(clients)
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
    filters: { search?: string; stage?: string; cursor?: string; pageSize?: number },
  ): Promise<CursorPaginatedResult<Client>> {
    const { limit, pageSize, cursor } = cursorValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(clients.deletedAt), eq(clients.tenantId, tenantId)]
      if (filters.search) conditions.push(ilike(clients.name, `%${filters.search}%`))
      if (cursor) {
        const cond = or(
          lt(clients.createdAt, new Date(cursor.at)),
          and(eq(clients.createdAt, new Date(cursor.at)), lt(clients.id, cursor.id)),
        )
        if (cond) conditions.push(cond)
      }
      const rows = await tx
        .select()
        .from(clients)
        .where(and(...conditions))
        .orderBy(desc(clients.createdAt), desc(clients.id))
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

  async getById(tenantId: string, id: string): Promise<Client | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId), isNull(clients.deletedAt)))
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(tenantId: string, userId: string, data: CreateClientInput): Promise<Client> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(clients)
        .values({ ...data, tenantId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'client.created',
        resourceType: 'clients',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateClientInput,
  ): Promise<Client | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(clients)
        .set({ ...changes, updatedAt: new Date() })
        .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId), isNull(clients.deletedAt)))
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'client.updated',
        resourceType: 'clients',
        resourceId: id,
      })
      return row
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(clients)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId), isNull(clients.deletedAt)))
        .returning({ id: clients.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'client.deleted',
        resourceType: 'clients',
        resourceId: id,
      })
      return true
    })
  }
}

export const clientsService = new ClientsService()
