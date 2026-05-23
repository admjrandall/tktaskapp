// Dataverse (Power Platform) entry point.
// Token acquisition: Power Platform Code Apps inject __msalToken and __dataverseUrl
// into the window object before this script runs. For local dev, use .env.local.

import { DataverseAdapter } from '../../../packages/adapter-dataverse/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import {
  setDeploymentPolicy,
  DATAVERSE_DEPLOYMENT_POLICY,
} from '../../../packages/core/src/deployment-policy.js'
import { setPowerPlatformHooks } from '../../../packages/core/src/ai/providers/powerplatform.js'
import { init } from '../../../packages/core/src/main.js'

// ── Token + environment URL ───────────────────────────────────────────────────
// Power Platform Code Apps provide __msalToken (short-lived, auto-refreshed by
// the platform runtime). Env var fallback supports local dev + CI testing.

type PowerPlatformWindow = Window & {
  __msalToken?: string
  __dataverseUrl?: string
}

function getAccessToken(): string | null {
  return (
    (window as PowerPlatformWindow).__msalToken ??
    (import.meta.env['VITE_DATAVERSE_TOKEN'] as string | undefined) ??
    null
  )
}

const environmentUrl: string =
  (window as PowerPlatformWindow).__dataverseUrl ??
  (import.meta.env['VITE_DATAVERSE_ENV_URL'] as string | undefined) ??
  ''

// ── Entity map — internal store name → Dataverse entity set name ─────────────
const entityMap: Record<string, string> = {
  // Core CRM
  clients: 'tktaskapp_clients',
  departments: 'tktaskapp_departments',
  projects: 'tktaskapp_projects',
  tasks: 'tktaskapp_tasks',
  people: 'tktaskapp_people',
  communications: 'tktaskapp_communications',
  timeEntries: 'tktaskapp_timeentries',
  standaloneNotes: 'tktaskapp_standalonenotes',
  files: 'tktaskapp_files',
  tags: 'tktaskapp_tags',
  notifications: 'tktaskapp_notifications',
  // Phase 1 additions (C.1)
  deals: 'tktaskapp_deals',
  pipelines: 'tktaskapp_pipelines',
  // Phase 5 additions (C.1 IDB stores provisioned in Dataverse)
  customFieldDefs: 'tktaskapp_customfielddefs',
  aiAttributeDefs: 'tktaskapp_aiattributedefs',
  aiAttributeValues: 'tktaskapp_aiattributevalues',
  extensionObjectDefs: 'tktaskapp_extensionobjdefs',
  extensionObjectInstances: 'tktaskapp_extensionobjinstances',
}

// ── Guard: fail fast if environment URL is missing ────────────────────────────
// An empty environmentUrl would silently send all OData requests to the page
// origin instead of the Dataverse environment. Surface this early.
if (!environmentUrl) {
  const msg =
    'Dataverse: __dataverseUrl is not set. ' +
    'Power Platform must inject this value before the script runs, ' +
    'or set VITE_DATAVERSE_ENV_URL for local development.'
  // Display a user-visible error and halt — do not call init().
  const p = document.createElement('p')
  p.style.cssText =
    'display:grid;place-items:center;height:100vh;font-family:system-ui;color:#dc2626'
  p.textContent = msg
  document.body.appendChild(p)
  throw new Error(msg)
}

// ── Apply Dataverse deployment policy (C.7: standard lockdown, no Ollama) ────
setDeploymentPolicy(DATAVERSE_DEPLOYMENT_POLICY)

// ── Wire Power Platform AI provider ──────────────────────────────────────────
setPowerPlatformHooks(getAccessToken, environmentUrl)

// ── Boot ──────────────────────────────────────────────────────────────────────
// Pass the live getter so long-running sessions use the platform-refreshed token.
setAdapter(new DataverseAdapter({ environmentUrl, getAccessToken, entityMap }))
void init()
