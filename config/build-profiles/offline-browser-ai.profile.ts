import type { BuildProfile } from './types.js'

export const OFFLINE_BROWSER_AI_PROFILE = {
  id: 'offline-browser-ai',
  displayName: 'Offline — Browser AI (Gemini Nano / Phi-4-mini)',
  allowExternalNetwork: false,
  allowCloudAI: false,
  allowOllama: false,
  allowBrowserNano: true,
  aiMode: 'browser',
  adapter: 'null',
  storage: 'idb-vault',
  csp: 'strict-offline',
  requireServer: false,
  gdprErasureModel: 'local-vault-delete',
  kmsRequired: false,
  accessibilityTarget: 'WCAG-2.2-AA',
} as const satisfies BuildProfile
