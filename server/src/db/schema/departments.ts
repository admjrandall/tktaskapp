import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const departments = pgTable('departments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Department = typeof departments.$inferSelect
export type NewDepartment = typeof departments.$inferInsert
