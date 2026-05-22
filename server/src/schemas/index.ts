import * as v from 'valibot'

// Enum values must stay in sync with packages/core/src/constants.ts

// ── Clients ───────────────────────────────────────────────────────────────
export const CreateClientSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1)),
  contactName: v.optional(v.string()),
  email: v.optional(v.pipe(v.string(), v.email())),
  phone: v.optional(v.string()),
  website: v.optional(v.pipe(v.string(), v.url())),
  stage: v.optional(v.picklist(['Prospect', 'Active', 'Inactive', 'Churned'])),
  description: v.optional(v.string()),
})
export const UpdateClientSchema = v.partial(v.omit(CreateClientSchema, ['id']))
export type CreateClientInput = v.InferOutput<typeof CreateClientSchema>
export type UpdateClientInput = v.InferOutput<typeof UpdateClientSchema>

// ── Departments ───────────────────────────────────────────────────────────
export const CreateDepartmentSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1)),
  description: v.optional(v.string()),
})
export const UpdateDepartmentSchema = v.partial(v.omit(CreateDepartmentSchema, ['id']))
export type CreateDepartmentInput = v.InferOutput<typeof CreateDepartmentSchema>
export type UpdateDepartmentInput = v.InferOutput<typeof UpdateDepartmentSchema>

// ── Projects ──────────────────────────────────────────────────────────────
// Stages match PROJECT_STAGES in packages/core/src/constants.ts
export const CreateProjectSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1)),
  stage: v.optional(v.picklist(['Lead', 'Active', 'Review', 'On Hold', 'Done', 'Cancelled'])),
  priority: v.optional(v.picklist(['Low', 'Medium', 'High', 'Critical'])),
  dueDate: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'))),
  description: v.optional(v.string()),
  clientId: v.optional(v.pipe(v.string(), v.uuid())),
  ownerId: v.optional(v.pipe(v.string(), v.uuid())),
})
export const UpdateProjectSchema = v.partial(v.omit(CreateProjectSchema, ['id']))
export type CreateProjectInput = v.InferOutput<typeof CreateProjectSchema>
export type UpdateProjectInput = v.InferOutput<typeof UpdateProjectSchema>

// ── Tasks ─────────────────────────────────────────────────────────────────
// Statuses match TASK_STATUSES in packages/core/src/constants.ts
export const CreateTaskSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  title: v.pipe(v.string(), v.minLength(1)),
  status: v.optional(v.picklist(['Todo', 'In Progress', 'Blocked', 'Done'])),
  priority: v.optional(v.picklist(['Low', 'Medium', 'High', 'Critical'])),
  dueDate: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'))),
  description: v.optional(v.string()),
  projectId: v.optional(v.pipe(v.string(), v.uuid())),
  assigneeId: v.optional(v.pipe(v.string(), v.uuid())),
  parentId: v.optional(v.pipe(v.string(), v.uuid())),
})
export const UpdateTaskSchema = v.partial(v.omit(CreateTaskSchema, ['id']))
export type CreateTaskInput = v.InferOutput<typeof CreateTaskSchema>
export type UpdateTaskInput = v.InferOutput<typeof UpdateTaskSchema>

// ── People ────────────────────────────────────────────────────────────────
export const CreatePersonSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1)),
  role: v.optional(v.string()),
  email: v.optional(v.pipe(v.string(), v.email())),
  phone: v.optional(v.string()),
  departmentId: v.optional(v.pipe(v.string(), v.uuid())),
  clientId: v.optional(v.pipe(v.string(), v.uuid())),
})
export const UpdatePersonSchema = v.partial(v.omit(CreatePersonSchema, ['id']))
export type CreatePersonInput = v.InferOutput<typeof CreatePersonSchema>
export type UpdatePersonInput = v.InferOutput<typeof UpdatePersonSchema>

// ── Tags ──────────────────────────────────────────────────────────────────
export const CreateTagSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1)),
  color: v.optional(v.string()),
})
export const UpdateTagSchema = v.partial(v.omit(CreateTagSchema, ['id']))
export type CreateTagInput = v.InferOutput<typeof CreateTagSchema>
export type UpdateTagInput = v.InferOutput<typeof UpdateTagSchema>

// ── Communications ────────────────────────────────────────────────────────
// Types match COMM_TYPES in packages/core/src/constants.ts
export const CreateCommunicationSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  type: v.picklist(['Email', 'Call', 'Meeting', 'Note', 'Other']),
  subject: v.pipe(v.string(), v.minLength(1)),
  body: v.optional(v.string()),
  occurredAt: v.pipe(v.string(), v.isoTimestamp()),
  durationMinutes: v.optional(v.pipe(v.number(), v.integer())),
  relatedStore: v.optional(v.string()),
  relatedId: v.optional(v.string()),
  personId: v.optional(v.pipe(v.string(), v.uuid())),
  clientId: v.optional(v.pipe(v.string(), v.uuid())),
  createdBy: v.optional(v.string()),
})
export const UpdateCommunicationSchema = v.partial(v.omit(CreateCommunicationSchema, ['id']))
export type CreateCommunicationInput = v.InferOutput<typeof CreateCommunicationSchema>
export type UpdateCommunicationInput = v.InferOutput<typeof UpdateCommunicationSchema>

// ── Time Entries ──────────────────────────────────────────────────────────
export const CreateTimeEntrySchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  taskId: v.optional(v.pipe(v.string(), v.uuid())),
  userId: v.optional(v.string()),
  description: v.optional(v.string()),
  startedAt: v.pipe(v.string(), v.isoTimestamp()),
  endedAt: v.optional(v.pipe(v.string(), v.isoTimestamp())),
  durationSeconds: v.optional(v.pipe(v.number(), v.integer())),
})
export const UpdateTimeEntrySchema = v.partial(v.omit(CreateTimeEntrySchema, ['id']))
export type CreateTimeEntryInput = v.InferOutput<typeof CreateTimeEntrySchema>
export type UpdateTimeEntryInput = v.InferOutput<typeof UpdateTimeEntrySchema>

// ── Notifications ─────────────────────────────────────────────────────────
// Types match NOTIFICATION_TYPES in packages/core/src/constants.ts
export const CreateNotificationSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  userId: v.optional(v.string()),
  title: v.pipe(v.string(), v.minLength(1)),
  body: v.optional(v.string()),
  type: v.optional(v.picklist(['info', 'warning', 'due_soon', 'overdue', 'mention'])),
  relatedStore: v.optional(v.string()),
  relatedId: v.optional(v.string()),
  read: v.optional(v.boolean()),
})
export const UpdateNotificationSchema = v.partial(v.omit(CreateNotificationSchema, ['id']))
export type CreateNotificationInput = v.InferOutput<typeof CreateNotificationSchema>
export type UpdateNotificationInput = v.InferOutput<typeof UpdateNotificationSchema>

// ── Files ─────────────────────────────────────────────────────────────────
export const CreateFileSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1)),
  url: v.optional(v.pipe(v.string(), v.url())),
  mimeType: v.optional(v.string()),
  sizeBytes: v.optional(v.pipe(v.number(), v.integer())),
  relatedStore: v.optional(v.string()),
  relatedId: v.optional(v.string()),
  uploadedBy: v.optional(v.string()),
})
export const UpdateFileSchema = v.partial(v.omit(CreateFileSchema, ['id']))
export type CreateFileInput = v.InferOutput<typeof CreateFileSchema>
export type UpdateFileInput = v.InferOutput<typeof UpdateFileSchema>

// ── Documents ─────────────────────────────────────────────────────────────
export const CreateDocumentSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  title: v.pipe(v.string(), v.minLength(1)),
  body: v.optional(v.string()),
  linkedStore: v.optional(v.string()),
  linkedId: v.optional(v.string()),
  section: v.optional(v.string()),
  pinned: v.optional(v.boolean()),
  tagIds: v.optional(v.array(v.string())),
})
export const UpdateDocumentSchema = v.partial(v.omit(CreateDocumentSchema, ['id']))
export type CreateDocumentInput = v.InferOutput<typeof CreateDocumentSchema>
export type UpdateDocumentInput = v.InferOutput<typeof UpdateDocumentSchema>

// ── Standalone Notes ──────────────────────────────────────────────────────
export const CreateStandaloneNoteSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  body: v.pipe(v.string(), v.minLength(1)),
  clientId: v.optional(v.pipe(v.string(), v.uuid())),
  projectId: v.optional(v.pipe(v.string(), v.uuid())),
  taskId: v.optional(v.pipe(v.string(), v.uuid())),
  personId: v.optional(v.pipe(v.string(), v.uuid())),
})
export const UpdateStandaloneNoteSchema = v.partial(v.omit(CreateStandaloneNoteSchema, ['id']))
export type CreateStandaloneNoteInput = v.InferOutput<typeof CreateStandaloneNoteSchema>
export type UpdateStandaloneNoteInput = v.InferOutput<typeof UpdateStandaloneNoteSchema>

// ── Conversations ─────────────────────────────────────────────────────────
export const CreateConversationSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  userId: v.optional(v.string()),
  title: v.optional(v.string()),
  model: v.optional(v.string()),
})
export const UpdateConversationSchema = v.partial(v.omit(CreateConversationSchema, ['id']))
export const ConversationMessageSchema = v.object({
  role: v.picklist(['user', 'assistant']),
  content: v.string(),
  timestamp: v.string(),
})
export type CreateConversationInput = v.InferOutput<typeof CreateConversationSchema>
export type UpdateConversationInput = v.InferOutput<typeof UpdateConversationSchema>
export type ConversationMessage = v.InferOutput<typeof ConversationMessageSchema>

// ── Admin / GDPR Erase ────────────────────────────────────────────────────
export const EraseUserSchema = v.object({
  destroyAt: v.pipe(v.string(), v.isoTimestamp()),
  reason: v.optional(v.string()),
})
export type EraseUserInput = v.InferOutput<typeof EraseUserSchema>

// ── Validation helper ─────────────────────────────────────────────────────
// Returns { success, data } or { success, issues } matching the Zod safeParse shape
// so existing route error-handling code (`result.issues` / flatten) works without change.
export function safeParseV<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  data: unknown,
):
  | { success: true; data: v.InferOutput<TSchema> }
  | { success: false; issues: v.InferIssue<TSchema>[] } {
  const result = v.safeParse(schema, data)
  if (result.success) {
    return { success: true, data: result.output }
  }
  return { success: false, issues: result.issues }
}
