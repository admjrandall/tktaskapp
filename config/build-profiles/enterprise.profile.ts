import type { BuildProfile } from './types.js'

// Stub — enterprise architecture not yet implemented.
// Requires: OIDC/PKCE identity, OPA/Cedar policy engine, per-user KMS keys,
// server-side record store, OpenTelemetry instrumentation, centralized audit.
// See ENTERPRISE-ASSESSMENT.md and docs/architecture/ for the full design.
export const ENTERPRISE_PROFILE = {
  id: 'enterprise',
  displayName: 'Enterprise (stub — server architecture required)',
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
