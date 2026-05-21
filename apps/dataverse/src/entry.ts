// Dataverse (Power Platform) entry point.
//
// Prerequisites before this entry is production-capable:
//   - DataverseAdapter.pull() / push() / clear() implemented
//     (see packages/adapter-dataverse/src/index.ts)
//   - Entra ID MSAL token acquisition wired (accessToken below is a placeholder)
//   - Custom Dataverse tables provisioned and entityMap populated
//   - DataverseNotImplementedError caught and surfaced to the user on first sync attempt
//
// To test locally: set VITE_DATAVERSE_ENV_URL and VITE_DATAVERSE_TOKEN in .env.local

import { DataverseAdapter } from '../../../packages/adapter-dataverse/src/index.js'
import { setAdapter } from '../../../packages/core/src/storage/db.js'
import { init } from '../../../packages/core/src/main.js'

const environmentUrl = (import.meta.env['VITE_DATAVERSE_ENV_URL'] as string | undefined) ?? ''
const accessToken = (import.meta.env['VITE_DATAVERSE_TOKEN'] as string | undefined) ?? ''

// Entity map: internal store name → Dataverse entity set name.
// Update this map once the Dataverse tables are provisioned.
const entityMap: Record<string, string> = {
  tasks: 'tktaskapp_tasks',
  clients: 'tktaskapp_clients',
  projects: 'tktaskapp_projects',
  people: 'tktaskapp_people',
  departments: 'tktaskapp_departments',
  communications: 'tktaskapp_communications',
  timeEntries: 'tktaskapp_timeentries',
  standaloneNotes: 'tktaskapp_standalonenotes',
  files: 'tktaskapp_files',
  tags: 'tktaskapp_tags',
  notifications: 'tktaskapp_notifications',
}

setAdapter(new DataverseAdapter({ environmentUrl, accessToken, entityMap }))
void init()
