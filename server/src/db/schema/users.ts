import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'editor', 'viewer'])

export const tenantUsers = pgTable('tenant_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  externalId: text('external_id').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: userRoleEnum('role').notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const userKmsKeys = pgTable('user_kms_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => tenantUsers.id),
  keyVaultUri: text('key_vault_uri').notNull(),
  keyVersion: text('key_version').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  destroyAt: timestamp('destroy_at', { withTimezone: true }),
  destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// RLS: ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
// RLS: CREATE POLICY tenant_isolation ON tenant_users USING (org_id = current_setting('app.org_id')::uuid);
// RLS: Same pattern for user_kms_keys.
// These statements belong in server/src/db/migrations/0001_rls_policies.sql
