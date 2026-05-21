import * as v from 'valibot'

export const DocumentSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  title: v.optional(v.string()),
  body: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  linkedStore: v.optional(v.string()),
  linkedId: v.optional(v.string()),
  section: v.optional(v.string()),
  pinned: v.optional(v.boolean()),
  createdBy: v.optional(v.string()),
  tagIds: v.optional(v.array(v.string())),
})

export type Document = v.InferOutput<typeof DocumentSchema>
