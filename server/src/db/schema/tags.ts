import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  color: text('color'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
