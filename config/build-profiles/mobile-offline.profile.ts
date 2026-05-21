import type { BuildProfile } from './types.js'

// Stub — Capacitor implementation required before this profile is production-capable.
// See apps/mobile/README.md for what must exist first.
export const MOBILE_OFFLINE_PROFILE = {
  id: 'mobile-offline',
  displayName: 'Mobile Offline (Capacitor — stub)',
  allowExternalNetwork: false,
  allowCloudAI: false,
  allowOllama: false,
  allowBrowserNano: true,
  aiMode: 'browser',
  adapter: 'mobile-native',
  storage: 'native-filesystem',
  csp: 'capacitor-strict',
  requireServer: false,
  gdprErasureModel: 'local-vault-delete',
  kmsRequired: false,
  accessibilityTarget: 'WCAG-2.2-AA',
} as const satisfies BuildProfile
