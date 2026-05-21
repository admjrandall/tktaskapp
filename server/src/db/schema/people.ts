import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const people = pgTable('people', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  role: text('role'),
  email: text('email'),
  phone: text('phone'),
  departmentId: text('department_id'),
  clientId: text('client_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Person = typeof people.$inferSelect
export type NewPerson = typeof people.$inferInsert
