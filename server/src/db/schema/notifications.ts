import { pgTable, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core'

export const notificationTypeEnum = pgEnum('notification_type', [
  'info',
  'warning',
  'due_soon',
  'overdue',
  'mention',
])

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  type: notificationTypeEnum('type').notNull().default('info'),
  relatedStore: text('related_store'),
  relatedId: text('related_id'),
  read: boolean('read').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
