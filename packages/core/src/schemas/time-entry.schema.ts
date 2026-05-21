import * as v from 'valibot'

export const TimeEntrySchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  taskId: v.optional(v.string()),
  description: v.optional(v.string()),
  startedAt: v.string(),
  endedAt: v.optional(v.nullable(v.string())),
  durationSeconds: v.optional(v.number()),
})

export type TimeEntry = v.InferOutput<typeof TimeEntrySchema>
