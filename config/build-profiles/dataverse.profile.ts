import type { BuildProfile } from './types.js'

// Power Apps Code App delivery — Dataverse adapter.
// See apps/dataverse/ for the app entry and packages/adapter-dataverse/ for the adapter.
export const DATAVERSE_PROFILE = {
  id: 'dataverse',
  displayName: 'Dataverse / Power Apps Code App',
  allowExternalNetwork: true,
  allowCloudAI: true,
  allowOllama: false,
  allowBrowserNano: true,
  aiMode: 'cloud',
  adapter: 'dataverse',
  storage: 'dataverse',
  csp: 'dataverse',
  requireServer: false,
  gdprErasureModel: 'dataverse-managed',
  kmsRequired: false,
  accessibilityTarget: 'WCAG-2.2-AA',
} as const satisfies BuildProfile
