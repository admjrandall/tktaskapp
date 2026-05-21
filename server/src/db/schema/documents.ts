import { pgTable, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core'

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  excerpt: text('excerpt'),
  linkedStore: text('linked_store'),
  linkedId: text('linked_id'),
  section: text('section'),
  pinned: boolean('pinned').default(false),
  createdBy: text('created_by'),
  tagIds: jsonb('tag_ids').$type<string[]>().default([]),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
