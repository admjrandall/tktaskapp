import type { BuildProfile } from './types.js'

export const OFFLINE_INTERNAL_AI_PROFILE = {
  id: 'offline-internal-ai',
  displayName: 'Offline — Internal AI (Browser + LAN Ollama)',
  allowExternalNetwork: false,
  allowCloudAI: false,
  allowOllama: true,
  allowBrowserNano: true,
  aiMode: 'internal',
  adapter: 'null',
  storage: 'idb-vault',
  csp: 'strict-offline-with-lan',
  requireServer: false,
  gdprErasureModel: 'local-vault-delete',
  kmsRequired: false,
  accessibilityTarget: 'WCAG-2.2-AA',
} as const satisfies BuildProfile
