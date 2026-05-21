import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const taskStatusEnum = pgEnum('task_status', ['Todo', 'In Progress', 'Blocked', 'Done'])

export const taskPriorityEnum = pgEnum('task_priority', ['Low', 'Medium', 'High', 'Critical'])

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  title: text('title').notNull(),
  status: taskStatusEnum('status').default('Todo'),
  priority: taskPriorityEnum('priority').default('Medium'),
  dueDate: text('due_date'),
  description: text('description'),
  projectId: text('project_id'),
  assigneeId: text('assignee_id'),
  parentId: text('parent_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
