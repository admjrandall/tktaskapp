import type { BuildProfile } from './types.js'

// Mobile offline delivery — Capacitor WebView wrapping the enterprise-web build.
// See apps/mobile/ for iOS/Android packaging configuration.
export const MOBILE_OFFLINE_PROFILE = {
  id: 'mobile-offline',
  displayName: 'Mobile Offline (Capacitor)',
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
