import { conversations } from '../db/schema/conversations.js'
import { eq, and, isNull, count } from 'drizzle-orm'
import { withTenant, writeAuditEvent, paginationValues, type PaginatedResult } from './base.js'
import type {
  Conversation,
  NewConversation,
  ConversationMessage,
} from '../db/schema/conversations.js'

export type CreateConversationInput = Omit<
  NewConversation,
  'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>
export type UpdateConversationInput = Partial<Omit<CreateConversationInput, 'id'>>

export class ConversationsService {
  async list(
    tenantId: string,
    filters: { userId?: string; page?: number; pageSize?: number },
  ): Promise<PaginatedResult<Conversation>> {
    const { limit, offset, page, pageSize } = paginationValues(filters)
    return withTenant(tenantId, async (tx) => {
      const conditions = [isNull(conversations.deletedAt), eq(conversations.tenantId, tenantId)]
      if (filters.userId) conditions.push(eq(conversations.userId, filters.userId))
      const [rows, countRows] = await Promise.all([
        tx
          .select()
          .from(conversations)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        tx
          .select({ value: count() })
          .from(conversations)
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

  async getById(tenantId: string, id: string): Promise<Conversation | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.tenantId, tenantId),
            isNull(conversations.deletedAt),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    })
  }

  async create(
    tenantId: string,
    userId: string,
    data: CreateConversationInput,
  ): Promise<Conversation> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(conversations)
        .values({ ...data, tenantId })
        .returning()
      if (!row) throw new Error('Insert failed')
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'conversation.created',
        resourceType: 'conversations',
        resourceId: row.id,
      })
      return row
    })
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    changes: UpdateConversationInput,
  ): Promise<Conversation | null> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(conversations)
        .set({ ...changes, updatedAt: new Date() })
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.tenantId, tenantId),
            isNull(conversations.deletedAt),
          ),
        )
        .returning()
      if (!row) return null
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'conversation.updated',
        resourceType: 'conversations',
        resourceId: id,
      })
      return row
    })
  }

  async appendMessage(
    tenantId: string,
    userId: string,
    id: string,
    message: ConversationMessage,
  ): Promise<Conversation | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.tenantId, tenantId),
            isNull(conversations.deletedAt),
          ),
        )
        .limit(1)
      const conv = rows[0]
      if (!conv) return null
      const updatedMessages = [...conv.messages, message]
      const [row] = await tx
        .update(conversations)
        .set({ messages: updatedMessages, updatedAt: new Date() })
        .where(eq(conversations.id, id))
        .returning()
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'conversation.message_appended',
        resourceType: 'conversations',
        resourceId: id,
      })
      return row ?? null
    })
  }

  async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    return withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(conversations)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.tenantId, tenantId),
            isNull(conversations.deletedAt),
          ),
        )
        .returning({ id: conversations.id })
      if (!row) return false
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'conversation.deleted',
        resourceType: 'conversations',
        resourceId: id,
      })
      return true
    })
  }
}

export const conversationsService = new ConversationsService()
