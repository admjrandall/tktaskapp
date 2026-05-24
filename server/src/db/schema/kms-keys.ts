import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const kmsKeyLifecycle = pgTable('kms_key_lifecycle', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id').notNull(),
  keyVaultUri: text('key_vault_uri').notNull(),
  keyVersion: text('key_version').notNull(),
  event: text('event').notNull(),
  requestedBy: uuid('requested_by'),
  requestedReason: text('requested_reason'),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Append-only: INSERT only; no UPDATE or DELETE. Enforced by DB role grants + the
// 0006_audit_append_only.sql trigger. destruction-scheduler.ts polls for rows where
// event='SCHEDULE_DESTRUCTION' and effectiveAt <= NOW(), then calls Azure Key Vault
// to initiate key destruction and inserts a 'DESTROYED' row.
// RLS: ALTER TABLE kms_key_lifecycle ENABLE ROW LEVEL SECURITY;
// RLS: CREATE POLICY tenant_isolation ON kms_key_lifecycle USING (org_id = current_setting('app.org_id')::uuid);
