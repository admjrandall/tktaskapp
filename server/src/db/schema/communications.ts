import { pgTable, text, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core'

export const communicationTypeEnum = pgEnum('communication_type', [
  'call',
  'email',
  'meeting',
  'note',
])

export const communications = pgTable('communications', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  type: communicationTypeEnum('type').notNull(),
  subject: text('subject').notNull(),
  body: text('body'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes'),
  relatedStore: text('related_store'),
  relatedId: text('related_id'),
  personId: text('person_id'),
  clientId: text('client_id'),
  createdBy: text('created_by').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Communication = typeof communications.$inferSelect
export type NewCommunication = typeof communications.$inferInsert
