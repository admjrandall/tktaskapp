import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const projectStageEnum = pgEnum('project_stage', [
  'Planning',
  'Active',
  'On Hold',
  'Completed',
  'Cancelled',
])

export const projectPriorityEnum = pgEnum('project_priority', ['Low', 'Medium', 'High', 'Critical'])

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  stage: projectStageEnum('stage').default('Planning'),
  priority: projectPriorityEnum('priority').default('Medium'),
  dueDate: text('due_date'),
  description: text('description'),
  clientId: text('client_id'),
  ownerId: text('owner_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
