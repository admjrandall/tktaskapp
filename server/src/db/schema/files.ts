import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core'

export const files = pgTable('files', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  url: text('url'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  relatedStore: text('related_store'),
  relatedId: text('related_id'),
  uploadedBy: text('uploaded_by'),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type File = typeof files.$inferSelect
export type NewFile = typeof files.$inferInsert
