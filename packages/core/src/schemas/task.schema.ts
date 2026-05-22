import * as v from 'valibot'

export const TaskSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  title: v.string(),
  status: v.optional(v.picklist(['Todo', 'In Progress', 'Blocked', 'Done'])),
  priority: v.optional(v.picklist(['Low', 'Medium', 'High', 'Critical'])),
  dueDate: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'))),
  description: v.optional(v.string()),
  projectId: v.optional(v.string()),
  assigneeId: v.optional(v.string()),
  parentId: v.optional(v.string()),
  customFields: v.optional(v.record(v.string(), v.unknown()), {}),
  aiAttributes: v.optional(v.record(v.string(), v.unknown()), {}),
  extensionLinks: v.optional(v.array(v.object({ defId: v.string(), instanceId: v.string() })), []),
})

export type Task = v.InferOutput<typeof TaskSchema>
