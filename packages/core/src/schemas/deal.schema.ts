import * as v from 'valibot'

export const DealSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  name: v.string(),
  stage: v.optional(
    v.picklist(['Prospect', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']),
  ),
  value: v.optional(v.number()),
  currency: v.optional(v.string()),
  probability: v.optional(v.number()),
  expectedCloseDate: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'))),
  clientId: v.optional(v.string()),
  pipelineId: v.optional(v.string()),
  ownerId: v.optional(v.string()),
  description: v.optional(v.string()),
  tags: v.optional(v.array(v.string()), []),
  customFields: v.optional(v.record(v.string(), v.unknown()), {}),
  aiAttributes: v.optional(v.record(v.string(), v.unknown()), {}),
  extensionLinks: v.optional(v.array(v.object({ defId: v.string(), instanceId: v.string() })), []),
})

export type Deal = v.InferOutput<typeof DealSchema>
