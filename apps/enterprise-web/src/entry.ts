// Enterprise web entry point — stub.
//
// This target will deliver Task App CRM as a server-backed enterprise web app.
// It is NOT production-capable. The required server-side architecture does not
// yet exist. Do not import or deploy this entry until all prerequisites below
// are complete.
//
// Build profile: ENTERPRISE_PROFILE
//   id:                   enterprise
//   requireServer:        true
//   gdprErasureModel:     kms-crypto-shredding
//   kmsRequired:          true
//   accessibilityTarget:  WCAG-2.2-AA
//   allowCloudAI:         true
//
// Wiring order (Phase 9 implementation target):
//
//   1. validateOidcToken(token)
//      Verify the access token with the OIDC provider before any other code runs.
//      RFC 9700: authorization code flow + PKCE only; no implicit flow.
//      See: server/src/auth/oidc.ts
//
//   2. setDeploymentPolicy(ENTERPRISE_PROFILE.policy)
//      Cloud AI, Ollama, and browser AI all permitted per enterprise profile.
//      AI providers still require tenant-admin enablement via the AI gateway policy engine.
//
//   3. setAdapter(new RxDBSyncAdapter(serverEndpoint))
//      RxDB with server-sync. The server is the system of record.
//      NullAdapter must NOT be used in production enterprise builds.
//
//   4. setKmsAdapter(new KmsKeyService(kmsConfig))
//      Per-user DEK/KEK hierarchy for GDPR Article 17 erasure.
//      Encrypted data is unreadable after KMS key destruction.
//      See: server/src/kms/key-service.ts
//
//   5. setAuthorizationEngine(new PolicyEngine(policySource))
//      OPA or Cedar for deny-by-default object-level authorization.
//      Evaluated on every API request and service-layer mutation.
//      See: server/src/authorization/policy-engine.ts
//
//   6. initOtel(otelConfig)
//      OpenTelemetry traces, metrics, and structured logs.
//      Required for SOC 2 Availability evidence.
//      See: server/src/observability/otel.ts
//
//   7. init()
//      Runs migrations, authenticates, renders UI.
//
// Prerequisites before this entry is wired to a real build:
//
//   Identity:
//     - OIDC/PKCE token validation (server/src/auth/oidc.ts — Phase 9 stub)
//     - Server-side refresh token rotation and revocation list
//     - Step-up re-authentication for destructive operations
//
//   Authorization:
//     - OPA or Cedar policy engine deployment (server/src/authorization/policy-engine.ts)
//     - Deny-by-default policies for all CRM resource types
//     - BOLA/IDOR test suite (tests/security/bola-idor.test.ts)
//
//   Storage:
//     - Concrete RxDBSyncAdapter connecting to the server API
//     - Server-side system of record (not IndexedDB as primary store)
//     - Per-user KMS key issuance and DEK wrapping (server/src/kms/key-service.ts)
//
//   Compliance:
//     - GDPR erasure workflow (server/src/kms/erasure-workflow.ts)
//     - Legal hold capability (server/src/kms/legal-hold.ts)
//     - Centralized append-only audit log (server-side, not IDB)
//
//   Observability:
//     - OpenTelemetry SDK initialized (server/src/observability/otel.ts)
//     - SLO definitions met: P99 < 500ms, error rate < 0.1%, uptime > 99.9%
//
//   AI governance:
//     - AI governance policy documented (docs/compliance/ai-governance-policy.md)
//     - Tenant AI policy engine (server/src/ai-gateway/policy-engine.ts)
//     - DPA reviewed and approved for each cloud AI provider
//
//   Accessibility:
//     - WCAG 2.2 AA audit complete; axe-core CI passing; VPAT prepared
//
// This file is a documented design stub. Do not remove or simplify the comments —
// they serve as the acceptance checklist for enterprise production readiness.

import { ENTERPRISE_PROFILE } from '@config/build-profiles/enterprise.profile.js'

// TODO: import { OidcService } from '../../server/src/auth/oidc.js'
// TODO: import { PolicyEngine } from '../../server/src/authorization/policy-engine.js'
// TODO: import { KeyService } from '../../server/src/kms/key-service.js'
// TODO: import { OtelService } from '../../server/src/observability/otel.js'
// TODO: import { setAdapter } from '@core/db.js'
// TODO: import { init } from '@core/main.js'

// Confirm the enterprise profile is the one selected — fails at import time if misconfigured.
const _profile = ENTERPRISE_PROFILE
void _profile

// TODO: implement the wiring order above once all prerequisites exist.
export {}
