import * as v from 'valibot'

export const PipelineSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  name: v.string(),
  type: v.optional(v.picklist(['sales', 'partnership', 'renewal', 'custom'])),
  description: v.optional(v.string()),
  stages: v.optional(
    v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        order: v.number(),
        probability: v.optional(v.number()),
      }),
    ),
    [],
  ),
  color: v.optional(v.string()),
  isDefault: v.optional(v.boolean(), false),
  customFields: v.optional(v.record(v.string(), v.unknown()), {}),
  aiAttributes: v.optional(v.record(v.string(), v.unknown()), {}),
  extensionLinks: v.optional(v.array(v.object({ defId: v.string(), instanceId: v.string() })), []),
})

export type Pipeline = v.InferOutput<typeof PipelineSchema>
