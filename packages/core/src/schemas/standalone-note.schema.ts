import * as v from 'valibot'

export const StandaloneNoteSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  body: v.pipe(v.string(), v.minLength(1)),
  clientId: v.optional(v.string()),
  projectId: v.optional(v.string()),
  taskId: v.optional(v.string()),
  personId: v.optional(v.string()),
  createdBy: v.optional(v.string()),
})

export type StandaloneNote = v.InferOutput<typeof StandaloneNoteSchema>
