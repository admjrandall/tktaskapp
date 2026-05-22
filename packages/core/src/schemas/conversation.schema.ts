import * as v from 'valibot'

export const ConversationMessageSchema = v.object({
  role: v.picklist(['user', 'assistant']),
  content: v.string(),
  timestamp: v.string(),
})

export const ConversationSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  userId: v.optional(v.string()),
  title: v.optional(v.string()),
  model: v.optional(v.string()),
  messages: v.optional(v.array(ConversationMessageSchema)),
  customFields: v.optional(v.record(v.string(), v.unknown()), {}),
  aiAttributes: v.optional(v.record(v.string(), v.unknown()), {}),
  extensionLinks: v.optional(v.array(v.object({ defId: v.string(), instanceId: v.string() })), []),
})

export type ConversationMessage = v.InferOutput<typeof ConversationMessageSchema>
export type Conversation = v.InferOutput<typeof ConversationSchema>
