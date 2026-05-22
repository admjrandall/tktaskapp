import * as v from 'valibot'

export const PersonSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  name: v.string(),
  role: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  departmentId: v.optional(v.string()),
  clientId: v.optional(v.string()),
  customFields: v.optional(v.record(v.string(), v.unknown()), {}),
  aiAttributes: v.optional(v.record(v.string(), v.unknown()), {}),
  extensionLinks: v.optional(v.array(v.object({ defId: v.string(), instanceId: v.string() })), []),
})

export type Person = v.InferOutput<typeof PersonSchema>
