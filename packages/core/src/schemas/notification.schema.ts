import * as v from 'valibot'
import { NOTIFICATION_TYPES } from '../constants.js'

export const NotificationSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  userId: v.optional(v.string()),
  title: v.pipe(v.string(), v.minLength(1)),
  body: v.optional(v.string()),
  type: v.picklist(NOTIFICATION_TYPES as unknown as [string, ...string[]]),
  relatedStore: v.optional(v.string()),
  relatedId: v.optional(v.string()),
  read: v.optional(v.boolean()),
  customFields: v.optional(v.record(v.string(), v.unknown()), {}),
  aiAttributes: v.optional(v.record(v.string(), v.unknown()), {}),
  extensionLinks: v.optional(v.array(v.object({ defId: v.string(), instanceId: v.string() })), []),
})

export type Notification = v.InferOutput<typeof NotificationSchema>
