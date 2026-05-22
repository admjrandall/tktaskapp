import * as v from 'valibot'

export const PersonaProfileSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  personaId: v.picklist(['closer', 'maintainer', 'investigator', 'builder', 'inspector']),
  displayName: v.optional(v.string()),
  pinnedViews: v.optional(v.array(v.string()), []),
  defaultView: v.optional(v.string()),
  sidebarOrder: v.optional(v.array(v.string()), []),
  dashboardLayout: v.optional(v.record(v.string(), v.unknown())),
  aiPrefs: v.optional(v.record(v.string(), v.unknown())),
  isActive: v.optional(v.boolean(), false),
})

export type PersonaProfile = v.InferOutput<typeof PersonaProfileSchema>
