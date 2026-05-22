import * as v from 'valibot'

const ExtensionFieldSchema = v.looseObject({
  key: v.string(),
  label: v.string(),
  type: v.picklist(['text', 'number', 'boolean', 'date', 'select', 'relation', 'url', 'email']),
  required: v.optional(v.boolean(), false),
  options: v.optional(v.array(v.string()), []),
})

export const ExtensionObjectDefSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  name: v.string(),
  label: v.string(),
  fields: v.optional(v.array(ExtensionFieldSchema), []),
  icon: v.optional(v.string()),
  color: v.optional(v.string()),
  allowedRelations: v.optional(v.array(v.string()), []),
})

export type ExtensionObjectDef = v.InferOutput<typeof ExtensionObjectDefSchema>

export const ExtensionObjectInstanceSchema = v.looseObject({
  id: v.string(),
  defId: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  fields: v.optional(v.record(v.string(), v.unknown()), {}),
  tenantId: v.optional(v.string()),
  customFields: v.optional(v.record(v.string(), v.unknown()), {}),
  aiAttributes: v.optional(v.record(v.string(), v.unknown()), {}),
  deletedAt: v.optional(v.string()),
})

export type ExtensionObjectInstance = v.InferOutput<typeof ExtensionObjectInstanceSchema>
