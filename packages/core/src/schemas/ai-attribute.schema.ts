// C.2 AI Attribute shapes
import * as v from 'valibot'

export const AIAttributeDefSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  entityType: v.string(),
  fieldKey: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]*$/, 'snake_case required')),
  label: v.string(),
  prompt: v.string(),
  dataSources: v.optional(
    v.array(
      v.looseObject({
        kind: v.picklist(['field', 'relation', 'communications', 'history']),
        path: v.string(),
      }),
    ),
    [],
  ),
  model: v.optional(
    v.looseObject({
      tier: v.picklist(['browser', 'ollama', 'cloud', 'powerplatform']),
      preferredModelId: v.optional(v.string()),
    }),
  ),
  refreshInterval: v.optional(v.picklist(['on_change', 'daily', 'weekly', 'manual']), 'manual'),
  hipaaClassified: v.optional(v.boolean(), false),
  euAiActScope: v.optional(v.picklist(['operational', 'decision-support']), 'operational'),
})

export type AIAttributeDef = v.InferOutput<typeof AIAttributeDefSchema>

const ProvenanceSchema = v.looseObject({
  provider: v.picklist([
    'browser-nano',
    'browser-transformers',
    'ollama',
    'anthropic',
    'openai',
    'google',
    'powerplatform',
  ]),
  modelId: v.string(),
  computedAt: v.string(),
  computeDurationMs: v.number(),
  confidence: v.nullable(v.number()),
  inputDataHashes: v.array(v.string()),
  promptHash: v.string(),
})

export const AIAttributeValueSchema = v.looseObject({
  defId: v.string(),
  recordId: v.string(),
  entityType: v.string(),
  value: v.nullable(v.union([v.string(), v.number(), v.boolean()])),
  provenance: ProvenanceSchema,
  errorState: v.optional(v.looseObject({ message: v.string(), lastAttemptAt: v.string() })),
})

export type AIAttributeValue = v.InferOutput<typeof AIAttributeValueSchema>
