import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Per-tenant AI provider/model allowlist. Production and lockdown AI gateway
// calls require an exact provider + model_id match.
// Managed via POST/DELETE /api/v1/admin/ai-allowlist.
export const aiEndpointAllowlist = pgTable('ai_endpoint_allowlist', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  provider: text('provider').notNull(),
  modelId: text('model_id').notNull(),
  reason: text('reason').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AIEndpointAllowlistEntry = typeof aiEndpointAllowlist.$inferSelect
export type NewAIEndpointAllowlistEntry = typeof aiEndpointAllowlist.$inferInsert
