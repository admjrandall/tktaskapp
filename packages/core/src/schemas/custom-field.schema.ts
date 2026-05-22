import * as v from 'valibot'

export const CustomFieldDefSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  entityType: v.string(),
  key: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]*$/, 'snake_case required')),
  label: v.string(),
  type: v.picklist(['text', 'number', 'boolean', 'date', 'select', 'multiselect', 'url', 'email']),
  options: v.optional(v.array(v.string()), []),
  required: v.optional(v.boolean(), false),
  description: v.optional(v.string()),
})

export type CustomFieldDef = v.InferOutput<typeof CustomFieldDefSchema>
