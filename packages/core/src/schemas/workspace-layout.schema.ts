import * as v from 'valibot'

const CanvasBlockSchema = v.looseObject({
  id: v.string(),
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  z: v.optional(v.number()),
  type: v.optional(v.string()),
  config: v.optional(v.record(v.string(), v.unknown())),
})

export const WorkspaceLayoutSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  name: v.string(),
  view: v.string(),
  personaId: v.optional(v.string()),
  blocks: v.optional(v.array(CanvasBlockSchema), []),
  isDefault: v.optional(v.boolean(), false),
})

export type WorkspaceLayout = v.InferOutput<typeof WorkspaceLayoutSchema>
export type CanvasBlockSchema = v.InferOutput<typeof CanvasBlockSchema>
