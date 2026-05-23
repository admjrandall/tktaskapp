import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Per-tenant AI provider allowlist. When an entry exists for a provider, the
// AI gateway policy engine permits requests to that provider even under lockdown.
// Managed via POST/DELETE /api/v1/admin/ai-allowlist.
export const aiEndpointAllowlist = pgTable('ai_endpoint_allowlist', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  provider: text('provider').notNull(),
  modelId: text('model_id'),
  reason: text('reason').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AIEndpointAllowlistEntry = typeof aiEndpointAllowlist.$inferSelect
export type NewAIEndpointAllowlistEntry = typeof aiEndpointAllowlist.$inferInsert
