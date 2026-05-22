import * as v from 'valibot'
import { COMM_TYPES } from '../constants.js'

export const CommunicationSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  type: v.picklist(COMM_TYPES as unknown as [string, ...string[]]),
  subject: v.pipe(v.string(), v.minLength(1)),
  body: v.optional(v.string()),
  occurredAt: v.string(),
  durationMinutes: v.optional(v.number()),
  relatedStore: v.optional(v.string()),
  relatedId: v.optional(v.string()),
  personId: v.optional(v.string()),
  clientId: v.optional(v.string()),
  customFields: v.optional(v.record(v.string(), v.unknown()), {}),
  aiAttributes: v.optional(v.record(v.string(), v.unknown()), {}),
  extensionLinks: v.optional(v.array(v.object({ defId: v.string(), instanceId: v.string() })), []),
})

export type Communication = v.InferOutput<typeof CommunicationSchema>
