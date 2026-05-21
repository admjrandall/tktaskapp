import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const legalHolds = pgTable('legal_holds', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id').notNull(),
  reason: text('reason').notNull(),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  liftedAt: timestamp('lifted_at', { withTimezone: true }),
  placedBy: text('placed_by').notNull(),
  liftedBy: text('lifted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type LegalHold = typeof legalHolds.$inferSelect
export type NewLegalHold = typeof legalHolds.$inferInsert
