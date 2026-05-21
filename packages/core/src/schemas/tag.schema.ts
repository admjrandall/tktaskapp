import * as v from 'valibot'

export const TagSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  name: v.pipe(v.string(), v.minLength(1)),
  color: v.string(),
})

export type Tag = v.InferOutput<typeof TagSchema>
