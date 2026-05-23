import { pgTable, text, boolean, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core'

// Flat document store for the Hono-native 3-endpoint sync protocol (C.3).
// Every CRM entity is stored here as a versioned blob with a monotonic rev.
// Primary key is composite (id, store, org_id) to allow the same record UUID
// to appear in different stores across different tenants.
export const syncDocuments = pgTable(
  'sync_documents',
  {
    id: text('id').notNull(),
    orgId: text('org_id').notNull(),
    store: text('store').notNull(),
    rev: text('rev').notNull(),
    data: jsonb('data').notNull().$type<Record<string, unknown>>(),
    deleted: boolean('deleted').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.id, t.store, t.orgId] })],
)

export type SyncDocument = typeof syncDocuments.$inferSelect
export type NewSyncDocument = typeof syncDocuments.$inferInsert
