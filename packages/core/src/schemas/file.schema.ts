import * as v from 'valibot'

export const FileSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  name: v.string(),
  url: v.optional(v.string()),
  addedAt: v.optional(v.string()),
  relatedStore: v.optional(v.string()),
  relatedId: v.optional(v.string()),
  dataUrl: v.optional(v.string()),
  size: v.optional(v.number()),
})

export type File = v.InferOutput<typeof FileSchema>
