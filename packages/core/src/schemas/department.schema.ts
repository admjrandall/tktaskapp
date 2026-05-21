import * as v from 'valibot'

export const DepartmentSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  name: v.pipe(v.string(), v.minLength(1)),
  description: v.optional(v.string()),
})

export type Department = v.InferOutput<typeof DepartmentSchema>
