// ── PERSONA PRESETS ───────────────────────────────────────────────────────────
// Five opinionated presets that configure sidebar nav, default view, and AI prefs.
// Users can customise further; these are the first-run defaults.

import type { PersonaId } from '../state.js'

export interface PersonaPreset {
  id: PersonaId
  label: string
  description: string
  defaultView: string
  pinnedViews: string[]
  sidebarOrder: string[]
  dashboardBlocks: string[]
  aiPromptHint: string
}

export const PERSONA_PRESETS: Record<PersonaId, PersonaPreset> = {
  operator: {
    id: 'operator',
    label: 'Operator',
    description: 'Monitor assets, work orders, and site compliance in real time.',
    defaultView: 'dashboard',
    pinnedViews: ['dashboard', 'tasks', 'clients', 'calendar'],
    sidebarOrder: ['dashboard', 'tasks', 'clients', 'people', 'communications', 'calendar'],
    dashboardBlocks: ['overview', 'attention', 'activity'],
    aiPromptHint:
      'Focus on asset health, active work orders, overdue maintenance, and site status.',
  },
  'field-engineer': {
    id: 'field-engineer',
    label: 'Field Engineer',
    description: 'Field work orders, site visits, compliance audits, and time tracking.',
    defaultView: 'tasks',
    pinnedViews: ['tasks', 'calendar', 'time', 'people'],
    sidebarOrder: ['tasks', 'calendar', 'time', 'clients', 'communications', 'standaloneNotes'],
    dashboardBlocks: ['overview', 'attention', 'timer'],
    aiPromptHint:
      "Focus on my open work orders, today's schedule, parts needed, and compliance checklist.",
  },
  closer: {
    id: 'closer',
    label: 'Closer',
    description: 'Pipeline management, deals, and client communications.',
    defaultView: 'clients',
    pinnedViews: ['clients', 'deals', 'communications', 'tasks'],
    sidebarOrder: [
      'dashboard',
      'clients',
      'deals',
      'communications',
      'projects',
      'tasks',
      'people',
      'calendar',
    ],
    dashboardBlocks: ['overview', 'clients', 'actions', 'activity'],
    aiPromptHint: 'Focus on pipeline velocity, deal health, and next-best-actions for revenue.',
  },
  maintainer: {
    id: 'maintainer',
    label: 'Maintainer',
    description: 'Ongoing client relationships, projects, and task tracking.',
    defaultView: 'dashboard',
    pinnedViews: ['dashboard', 'projects', 'tasks', 'people'],
    sidebarOrder: [
      'dashboard',
      'projects',
      'tasks',
      'clients',
      'people',
      'communications',
      'calendar',
    ],
    dashboardBlocks: ['overview', 'attention', 'activity', 'team'],
    aiPromptHint: 'Focus on task health, project progress, and relationship maintenance.',
  },
  investigator: {
    id: 'investigator',
    label: 'Investigator',
    description: 'Deep-dive analytics, reports, and audit visibility.',
    defaultView: 'reports',
    pinnedViews: ['reports', 'dashboard', 'tasks', 'time'],
    sidebarOrder: ['reports', 'dashboard', 'time', 'clients', 'projects', 'tasks', 'settings'],
    dashboardBlocks: ['overview', 'activity', 'clients', 'timer'],
    aiPromptHint: 'Focus on trends, anomalies, compliance insights, and data patterns.',
  },
  builder: {
    id: 'builder',
    label: 'Builder',
    description: 'Project management, tasks, and team coordination.',
    defaultView: 'projects',
    pinnedViews: ['projects', 'tasks', 'people', 'calendar'],
    sidebarOrder: [
      'projects',
      'tasks',
      'people',
      'dashboard',
      'calendar',
      'time',
      'standaloneNotes',
    ],
    dashboardBlocks: ['overview', 'attention', 'team', 'timer'],
    aiPromptHint: 'Focus on task blockers, sprint progress, resource allocation, and deadlines.',
  },
  inspector: {
    id: 'inspector',
    label: 'Inspector',
    description: 'Compliance, security, and admin tooling.',
    defaultView: 'settings',
    pinnedViews: ['settings', 'reports', 'dashboard', 'trash'],
    sidebarOrder: ['settings', 'reports', 'dashboard', 'clients', 'projects', 'tasks', 'trash'],
    dashboardBlocks: ['overview', 'activity', 'actions'],
    aiPromptHint:
      'Focus on security events, compliance status, audit log anomalies, and policy adherence.',
  },
}

export function getPersonaPreset(id: PersonaId): PersonaPreset {
  return PERSONA_PRESETS[id]
}

export function getPersonaSidebarOrder(id: PersonaId | null): string[] {
  if (!id) return PERSONA_PRESETS.maintainer.sidebarOrder
  return PERSONA_PRESETS[id].sidebarOrder
}

export function getPersonaDefaultView(id: PersonaId | null): string {
  if (!id) return 'dashboard'
  return PERSONA_PRESETS[id].defaultView
}
