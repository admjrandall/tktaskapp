import * as v from 'valibot'

export const ProjectSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  name: v.string(),
  stage: v.optional(v.picklist(['Lead', 'Active', 'Review', 'On Hold', 'Done', 'Cancelled'])),
  priority: v.optional(v.picklist(['Low', 'Medium', 'High', 'Critical'])),
  dueDate: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'))),
  description: v.optional(v.string()),
  clientId: v.optional(v.string()),
  ownerId: v.optional(v.string()),
})

export type Project = v.InferOutput<typeof ProjectSchema>
