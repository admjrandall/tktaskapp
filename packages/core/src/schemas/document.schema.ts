import * as v from 'valibot'

export const DocumentSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  title: v.optional(v.string()),
  body: v.optional(v.string()),
})

export type Document = v.InferOutput<typeof DocumentSchema>
