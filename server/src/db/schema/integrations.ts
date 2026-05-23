import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core'

// Third-party integration registrations (webhooks, Dataverse, calendar, custom).
// Config is stored as encrypted-at-rest JSON; key management via KMS adapter.
// Managed via POST/DELETE /api/v1/admin/integrations.
export const integrations = pgTable('integrations', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  config: jsonb('config').notNull().default({}).$type<Record<string, unknown>>(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Integration = typeof integrations.$inferSelect
export type NewIntegration = typeof integrations.$inferInsert
