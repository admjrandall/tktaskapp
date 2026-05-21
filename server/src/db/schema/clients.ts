import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const clientStageEnum = pgEnum('client_stage', ['Prospect', 'Active', 'Inactive', 'Churned'])

export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  website: text('website'),
  stage: clientStageEnum('stage').default('Prospect'),
  description: text('description'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Client = typeof clients.$inferSelect
export type NewClient = typeof clients.$inferInsert
