import { pgTable, uuid, text, timestamp, jsonb, bigserial } from 'drizzle-orm/pg-core'

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id'),
  action: text('action').notNull(),
  resource: text('resource'),
  outcome: text('outcome').notNull(),
  metadata: jsonb('metadata'),
  traceId: text('trace_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // C.6 hash-chain fields — nullable for backward compat with pre-Phase-4 rows
  chainPosition: bigserial('chain_position', { mode: 'number' }),
  prevHash: text('prev_hash'),
  signedDigest: text('signed_digest'),
})

// Append-only: application role must NOT have UPDATE or DELETE on this table.
// GRANT INSERT, SELECT ON audit_events TO tktaskapp_app;
// Retention: records older than 7 years should be archived, not deleted (compliance).
// RLS: ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
// RLS: CREATE POLICY tenant_isolation ON audit_events USING (org_id = current_setting('app.org_id')::uuid);
