import type { BuildProfile } from './types.js'

// Enterprise PWA delivery — Hono server, OIDC/PKCE, OPA policy engine,
// per-user KMS keys, OpenTelemetry instrumentation, centralised audit log.
export const ENTERPRISE_PROFILE = {
  id: 'enterprise',
  displayName: 'Enterprise Web PWA',
  allowExternalNetwork: true,
  allowCloudAI: true,
  allowOllama: true,
  allowBrowserNano: true,
  aiMode: 'cloud',
  adapter: 'rxdb-sync',
  storage: 'server-kms',
  csp: 'enterprise',
  requireServer: true,
  gdprErasureModel: 'kms-crypto-shredding',
  kmsRequired: true,
  accessibilityTarget: 'WCAG-2.2-AA',
} as const satisfies BuildProfile
