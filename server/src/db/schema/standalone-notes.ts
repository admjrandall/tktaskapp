import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const standaloneNotes = pgTable('standalone_notes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  body: text('body').notNull(),
  clientId: text('client_id'),
  projectId: text('project_id'),
  taskId: text('task_id'),
  personId: text('person_id'),
  createdBy: text('created_by'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type StandaloneNote = typeof standaloneNotes.$inferSelect
export type NewStandaloneNote = typeof standaloneNotes.$inferInsert
