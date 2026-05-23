import { pgTable, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core'

// Per-tenant organisation settings (lockdown level, compliance packs, audit retention).
// One row per tenant — upserted on PATCH /api/v1/admin/org-settings.
export const orgSettings = pgTable('org_settings', {
  orgId: text('org_id').primaryKey(),
  lockdownLevel: text('lockdown_level').notNull().default('off'),
  retentionDays: integer('retention_days').notNull().default(2190),
  compliancePacks: jsonb('compliance_packs').notNull().default([]).$type<string[]>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type OrgSettings = typeof orgSettings.$inferSelect
export type NewOrgSettings = typeof orgSettings.$inferInsert
