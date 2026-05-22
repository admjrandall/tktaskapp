import * as v from 'valibot'

export const FileSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  name: v.string(),
  url: v.optional(v.string()),
  mimeType: v.optional(v.string()),
  sizeBytes: v.optional(v.number()),
  size: v.optional(v.number()),
  addedAt: v.optional(v.string()),
  relatedStore: v.optional(v.string()),
  relatedId: v.optional(v.string()),
  uploadedBy: v.optional(v.string()),
  dataUrl: v.optional(v.string()),
  customFields: v.optional(v.record(v.string(), v.unknown()), {}),
  aiAttributes: v.optional(v.record(v.string(), v.unknown()), {}),
  extensionLinks: v.optional(v.array(v.object({ defId: v.string(), instanceId: v.string() })), []),
})

export type File = v.InferOutput<typeof FileSchema>
