import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core'

export const timeEntries = pgTable('time_entries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  taskId: text('task_id'),
  userId: text('user_id').notNull(),
  description: text('description'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type TimeEntry = typeof timeEntries.$inferSelect
export type NewTimeEntry = typeof timeEntries.$inferInsert
