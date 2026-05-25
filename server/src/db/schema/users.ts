import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'editor', 'viewer'])

export const tenantUsers = pgTable('tenant_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  entraTenantId: text('entra_tenant_id').notNull(),
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

// RLS for tenant_users and user_kms_keys is enforced by server/drizzle/0001_rls_policies.sql.
