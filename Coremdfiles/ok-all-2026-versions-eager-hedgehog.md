# Plan — Task App CRM "Next Level" (2026)

> **Status: ACTIVE — Contracts locked (2026-05-22).** All 36 decisions resolved. Contracts C.1–C.9 frozen. Proceed to Phase 0.5 (main.ts split). Contract changes require user approval tagged `[contract-change]`.

## Context

The Task App CRM (`d:\techkeycrmapp`) is a TypeScript pnpm monorepo that ships as multiple build profiles (offline-web, pwa-sync, dataverse, mobile, enterprise-web). The monorepo migration is complete; the offline single-file app at `dist/offline/index.html` is functional. The user wants to take the app to "the next level" in 2026 — UI redesign, advanced features, future-proof architecture, AI-first identity — while preserving the open-source, offline-first, ICS/OT roots.

`Coremdfiles/featureadd.md` contains 28 implementation prompts written by Sonnet as **ideas, not commitments**. This plan starts from first principles and uses that document only as a reference menu.

---

## Decisions captured so far

| #   | Decision                     | User answer                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Primary user**             | Lead niche: **ICS/OT** (where pure offline shines). Secondary: broad horizontal (consulting, agencies, general SMB teams).                                                                                                                                                                                                                                                                                                  |
| 2   | **Business model**           | **Open core.** Offline single-user build is always free + open source. Enterprise compliance + advanced AI = paid. User retains full access to all features (self-host of paid features must work).                                                                                                                                                                                                                         |
| 3   | **Deployment modes**         | (a) Offline-only (OT, air-gapped, `file://`) — **always free**. (b) Enterprise/PWA — works offline, syncs when online. (c) Mobile (Capacitor) — same offline-then-sync behavior.                                                                                                                                                                                                                                            |
| 4   | **Sonnet's featureadd.md**   | Reference menu only. Re-evaluate every prompt against 2026 reality.                                                                                                                                                                                                                                                                                                                                                         |
| 5   | **AI identity**              | **AI is THE differentiator.** Not a chatbot bolted on.                                                                                                                                                                                                                                                                                                                                                                      |
| 6   | **Sync engine**              | **RxDB + custom Hono replication endpoints** (open source, Apache 2.0, IndexedDB-native, Lockdown-compatible, audit-wrappable, adapter-swappable later). CRDT plugin for collaborative records; LWW for everything else.                                                                                                                                                                                                    |
| 7   | **UI direction**             | Likes canvas/spatial workspaces. **Adaptive UI** — fits each user's working style. Not copying Attio or any other CRM; designing from first principles.                                                                                                                                                                                                                                                                     |
| 8   | **Two tracks, one codebase** | (a) **Offline track**: AI-enabled CRM, OT-grade security baked in, foundation for future OT-specific features. Open source. (b) **Enterprise track**: a genuinely new way of doing CRM. Wow-factor required. Human-centric. Speed + accuracy + ease.                                                                                                                                                                        |
| 9   | **Anchor values**            | Works everywhere · Privacy & Security · Speed · **Lockdown Mode** for enterprise (no AI/data ever crosses tenant boundary — cleaner than Microsoft Copilot, which leaks Claude traffic outside EU since Jan 2026).                                                                                                                                                                                                          |
| 10  | **Wedge**                    | "The CRM that works where no cloud CRM can, owned end-to-end by the user." Sovereignty/ownership angle. NOT competing on feature parity with HubSpot/Salesforce/Attio.                                                                                                                                                                                                                                                      |
| 11  | **Adaptive UX**              | App fits each user. AI learns from usage; surfaces frequent actions; auto-arranges canvas workspaces; user can override. Inspired by ClickUp/Notion AI 2026 adaptive UI patterns but applied to a CRM.                                                                                                                                                                                                                      |
| 12  | **Track UX**                 | SAME UI in offline + enterprise. Wow-factor required in BOTH. Features unavailable in offline (sync, multi-user, lockdown, advanced AI) are **disabled with clear explanation, never hidden**.                                                                                                                                                                                                                              |
| 13  | **Adaptive UX mechanism**    | All three layered: **Personas** (starting templates: Closer/Maintainer/Investigator/Builder/Inspector) → **Canvas** (user customizes blocks) → **AI suggestions** (proposes layout changes, user approves).                                                                                                                                                                                                                 |
| 14  | **Lockdown level**           | **Strong**: tenant-only AI + immutable hash-chained audit log + DLP-light (warn on copy/export, allow). No hardware-bound keys yet (defer to Strict tier later).                                                                                                                                                                                                                                                            |
| 15  | **AI Attributes**            | **First-class, free in offline build too.** User-defined fields powered by natural-language prompts. **Full provenance**: shows data read, model used, timestamp, confidence. Explainability IS the differentiator vs Attio.                                                                                                                                                                                                |
| 16  | **Data model**               | **Hybrid**: 8 fixed CRM entities stay code-defined (client, project, task, deal, person, communication, file, time-entry). Users can ALSO define **extension objects** (e.g. asset, work-order, campaign) with their own fields. Schema engine in vault.                                                                                                                                                                    |
| 17  | **Mobile**                   | **PWA first.** Modern PWAs (iOS 17.4+, Android) cover ~90% of mobile-CRM needs. Capacitor deferred until specific native needs (push, biometric, deeper offline) justify it.                                                                                                                                                                                                                                                |
| 18  | **Vertical scope**           | **Stay general for now.** Verticals become light terminology + template packs. Deep vertical features (OT-specific assets/work orders, healthcare PHI handling) layer on top once the general product is dialed in.                                                                                                                                                                                                         |
| 19  | **AI v1 scope**              | **Maximal**: AI Attributes (flagship) + Conversational chat + Command intent (`Cmd+K`) + Adaptive UI suggestions + Document/communication summaries + Voice input. Agentic 15-min background loop deferred to v1.1.                                                                                                                                                                                                         |
| 20  | **Server**                   | **KEEP** Hono v4 + Drizzle + Postgres + RLS + OPA + OTel. Add: RxDB replication endpoints, AI Attributes compute endpoint, admin console API, hash-chained immutable audit log.                                                                                                                                                                                                                                             |
| 21  | **First-run UX**             | **3-card picker**: Template · Persona · AI Guide (5-question interview). Same destination (personalized canvas), different paths. Everything changeable later.                                                                                                                                                                                                                                                              |
| 22  | **Admin onboarding**         | Separate flow from user onboarding. First admin sign-in: org name, IdP, Lockdown level, default template, audit retention, invite users. Admin console = role-gated left-rail section: Org Settings, Users & Roles, AI Endpoints, Lockdown rules, Audit Log, Integrations, Compliance Pack status, Billing. Linear-quality, not Power-Apps-form quality.                                                                    |
| 23  | **Roadmap**                  | Sequential phases reframed as **3 parallel workstreams** (2 Claude + 1 Codex subscriptions). Phase 0 = lock CONTRACTS.md (data model, AI interface, sync protocol, design tokens, Lockdown rules, module boundaries). Then Agent A=UI/UX, Agent B=AI v1 maximal, Agent C=Server/Sync/Admin/Lockdown run in parallel. ~4–5 month wall-clock vs ~10 month serial.                                                             |
| 24  | **First-run — card count**   | **3 cards** (Template / Persona / AI Guide). "Blank / start from scratch" hidden behind a small link below the cards for advanced users.                                                                                                                                                                                                                                                                                    |
| 25  | **OS license**               | **AGPLv3** for the open-source core (offline build + all free features). **Commercial license** for the paid tier (enterprise sync, Lockdown enforcement, advanced AI Attributes, compliance pack). User retains full self-host rights via license-back. Anti-SaaS-strip-mining stance.                                                                                                                                     |
| 26  | **OSS release timing**       | **After all is built.** No build-in-public. Public GitHub announcement when v1 + enterprise are both solid (~end of Phase 4 or 5).                                                                                                                                                                                                                                                                                          |
| 27  | **Data ownership split**     | **Offline build = USER-owned** (vault on disk, user password, user's CryptoKey) — sovereignty wedge applies ONLY here. **Enterprise/Mobile/Dataverse = COMPANY-owned** (corporate tenant KMS, Entra ID, Power Platform DLP). Users on those builds work within company policy, do not personally own the data. Clear positioning split.                                                                                     |
| 28  | **Four builds required**     | (1) **Offline** single-file (personal sovereign tool, AGPLv3, free). (2) **Mobile** PWA-first (corporate, syncs to enterprise server). (3) **Dataverse** Power Apps Code App with thin DataverseAdapter (same wow UI, Power Platform stores data, uses Power Platform Copilot/AI Builder). (4) **Enterprise** PWA-sync (self-host or Azure SaaS, full Lockdown/compliance pack). All four share `packages/core/src/` UI/AI. |
| 29  | **Mobile clarification**     | Mobile = **PWA install profile** of the Enterprise build (same code, mobile-optimized layouts, installable from browser). NOT Capacitor day-1. Native shell deferred until specific need.                                                                                                                                                                                                                                   |
| 30  | **Dataverse depth**          | **Thin adapter**. Same Tech Key wow UI, Dataverse stores records, Power Platform provides auth + DLP + conditional access automatically. Uses Power Platform Copilot / AI Builder for AI features in this build (consistent with Power Platform tenant governance).                                                                                                                                                         |
| 31  | **UI consistency**           | **Same UI in all 4 builds.** Build-specific adornments only where context truly requires (Lockdown banner, Power Platform navbar slot in Dataverse, mobile-touch target sizes). No build-specific render forks.                                                                                                                                                                                                             |
| 32  | **Naming centralization**    | Single `packages/core/src/branding.ts` with `BRAND` const. Every render reads from it. Name change = 1 file edit + rebuild. Easy to rename "Tech Key" later.                                                                                                                                                                                                                                                                |
| 33  | **Agent count**              | **6 agent roles** rotating across **3 concurrent subscription slots** (2 Claude + 1 Codex). Agent A=UI, B=AI, C=Server/Sync, D=Dataverse, E=Mobile, F=Verifier. F (Verifier) runs every phase. Phase concurrency mapped in `03-AGENT-STRATEGY.md`.                                                                                                                                                                          |
| 34  | **Verification**             | Dedicated **Verifier agent (F)** runs after every weekly merge: typecheck + tests + Playwright e2e + CSP/SRI checks + dependency audit. Reports findings to user; blocks integration on failures.                                                                                                                                                                                                                           |
| 35  | **Code reuse policy**        | ~50–60% of `packages/core/src/` survives the rebuild. Keep: crypto/vault/session/audit logic, schemas (Zod), adapter interface, server (Hono/Drizzle/Postgres/RLS/OPA/OTel), state core, utils, icons, deployment-policy. Refactor: state shape, audit hash-chain, ai-runtime/ai-ui. Rebuild: views, ui/components, AI UI surface. **Never rewrite code that already works correctly.**                                     |
| 36  | **Plan file structure**      | Becomes a directory: `00-OVERVIEW.md`, `01-CONTRACTS.md`, `02-PHASES.md`, `03-AGENT-STRATEGY.md`, `04-AGENT-A-UI.md`, `05-AGENT-B-AI.md`, `06-AGENT-C-SERVER.md`, `07-AGENT-D-DATAVERSE.md`, `08-AGENT-E-MOBILE.md`, `09-AGENT-F-VERIFIER.md`, `10-COMPLIANCE.md`, `11-VERIFICATION.md`, `12-OPEN-QUESTIONS.md`.                                                                                                            |

---

## 2026 landscape research (sourced)

### UI / UX state-of-the-art

- **Attio** is the consensus "best UI of any CRM in 2026" — fully-custom-object database + Linear/Notion-style design, **AI Attributes** as first-class computed fields, handles 50k+ records without lag.
- **Pipedrive** = rigid kanban-first sales tool; faster to set up but inflexible.
- **Folk** = relationship-first, design-led, collaborative.
- **Design currency in 2026 = TRUST + EXPLAINABILITY.** Users grant agency only to systems that surface their reasoning (UXmatters / Medium "State of Design 2026").
- **Role-based view design** is the single highest-impact UX decision for adoption.
- **User role shifts** from doing → reviewing/auditing/approving AI work. UI must be designed around exception handling, not just task entry.
- **Gartner**: 40% of enterprise apps will have task-specific AI agents by end of 2026.

### Offline-first sync 2026

- **PowerSync** — most production-tested. Postgres → client SQLite. Flexible sync rules.
- **ElectricSQL** — increasingly described as "legacy" in 2026 comparison content. Writes directly to Postgres, CRDT merge.
- **Triplit** — full-stack, CRDT-based, schema-defined consistency. Hottest 2026 newcomer.
- **Zero (Rocicorp)** — strong for new collaborative SaaS.
- **RxDB** — established choice for IndexedDB/JS, real-time replication to any backend (CouchDB/PouchDB protocol, MongoDB, GraphQL, etc.).

### Browser AI 2026

- **Chrome 148+**: The Prompt API (`window.LanguageModel`) ships by default. No flag required. Edge still uses `edge://flags` for Phi-4-mini on older versions.
- Desktop only: Windows 10/11, macOS 13+, Linux, ChromeOS Plus. **Mobile not yet.**
- Mozilla, Apple/WebKit, W3C TAG, Microsoft, and a Chrome engineer **all filed formal objections** — cross-browser story is rough.
- Edge has Phi-4-mini via similar API.
- **Implication**: For mobile + non-Chrome, need WebGPU/transformers.js fallback or cloud proxy.

### EU AI Act 2026

- **Full enforcement: August 2, 2026.**
- Transparency rules apply: users must be informed when interacting with AI, when content is AI-generated.
- Lead scoring + automated decision support likely "high-risk" — needs FRIA, logs, human review.
- Provider/deployer split matters for who carries which obligation.

### HIPAA / SOC 2 2026

- **HIPAA audit log: 6-year retention non-negotiable.**
- SOC 2: continuous assurance via AI compliance tools is the new normal.
- **Mandatory**: immutable log of every AI prompt, retrieval, response, human handoff. If it doesn't exist, that's a critical audit finding.

---

## Open questions — all resolved

All earlier open questions resolved during discussion (rows 1–36 above).

---

## Audit summary (140 files in scope)

Headline:

| Class        | Count | %    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ----- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **KEEP**     | ~35   | ~25% | crypto/vault/session/sanitize/trusted-types/idb-data/auth/mfa/totp/webauthn, all 9 AI providers, KMS/legal-hold/erasure/destruction-scheduler, OPA middleware, OTel middleware/metrics, CORS, audit service, users service, all 15 Valibot schemas (forms unchanged — extension is additive), all 17 Drizzle schemas, generate-csp.mjs, base.config.ts, all 6 build profiles                                                                                                                                                                                                                                                                                          |
| **EXTEND**   | ~55   | ~39% | constants.ts (new stores), deployment-policy.ts (lockdown level + new profiles), schemas (customFields + aiAttributes additions), Drizzle schemas (customFields jsonb + aiAttributes jsonb columns), services + routes (new entities + endpoints), AI prefs (per-build defaults), branding.ts (new file)                                                                                                                                                                                                                                                                                                                                                              |
| **REFACTOR** | ~30   | ~21% | state.ts (typed collections + workspace state), storage/db.ts (typed checkpoints + RxDB push payload + conflict hook), security/audit.ts (hash-chain + 6-year retention + new event types), adapter-interface.ts (richer push/pull shape), ai-runtime.ts (Attributes + commands + adaptive engine + provenance), ai-tools.ts (new tool catalog entries), ai-prefs.ts (per-build defaults), ai-settings.ts (admin-controlled providers), record-modal.ts (extension objects + AI Attribute inputs), workspace.ts (extension objects + AI Attribute columns), pwa-sync entry (rewire to Hono), Dataverse entry (MSAL + DATAVERSE profile), main.ts (split into 4 files) |
| **REBUILD**  | ~20   | ~14% | All 16 views (visual), ui/components.ts (design system), ai/ai-ui.ts (new AI surface), settings.ts (split into Admin Console + User Settings), apps/enterprise-web entry (full impl), apps/mobile entry (PWA install profile), packages/adapter-dataverse OData implementation, packages/adapter-rxdb rewrite from CouchDB protocol to RxDB 3-endpoint Hono-native protocol                                                                                                                                                                                                                                                                                           |
| **DELETE**   | 0     | 0%   | Nothing to remove.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Reuse rate ≈ 85%.** The new direction extends the existing foundation rather than replacing it. UI views + AI UI + the two stub app entries are the only true rebuilds.

---

## Recommended approach

### Strategy

One codebase, four shipped builds, three concurrent AI subscriptions running six agent roles in rotation. Lock contracts first, then run UI / AI / Server workstreams in parallel, with a Verifier agent gating every weekly merge.

### Phase 0 — Lock contracts (user + 1 agent, ~1 week, sequential)

Goal: produce `CONTRACTS.md` (rooted in `packages/core/src/contracts/`) that every workstream pins to. Contract changes route through the user, never agent-to-agent.

Contracts to lock:

- **Data model**: hybrid schema. 8 fixed CRM entities (clients, departments, projects, tasks, people, communications, files, timeEntries — currently in `packages/core/src/schemas/`) PLUS Deals + Pipelines (new), PLUS extension objects (user-defined, stored in `extensionObjectDefs` / `extensionObjectInstances` IDB stores).
- **AI Attribute shape**: `AIAttributeDef` (id, entityType, fieldKey, prompt, model, refreshInterval, hipaaClassified) + `AIAttributeValue` (defId, recordId, value, provenance { provider, modelId, computedAt, confidence, inputDataHashes }).
- **Sync protocol**: RxDB 3-endpoint replication (`POST /api/v1/sync/pull`, `POST /api/v1/sync/push`, `GET /api/v1/sync/stream`) on the existing `server/src/index.ts` Hono v4 server. Replaces the current CouchDB protocol in `packages/adapter-rxdb/src/index.ts`.
- **Design tokens**: colors, spacing, typography, motion, density modes (comfortable/compact). New file `packages/core/src/ui/design-tokens.ts`.
- **AI interface**: provider abstraction (already exists in `packages/core/src/ai/ai-runtime.ts` with the `aiRuntime` mutable state object) extended with provenance recording + command intent dispatch + adaptive UI suggestion engine.
- **Audit event shape**: hash-chain (`prev_hash`, `signed_digest`) + new event types (`ai_attribute_computed`, `ai_command_executed`, `ai_chat_message`, `dlp_warning`, `lockdown_violation_blocked`, `adaptive_suggestion_proposed`, `adaptive_suggestion_accepted`).
- **Lockdown enforcement boundaries**: which client code paths react to lockdown level, which server middleware enforces it, where CSP gates outbound origins.
- **Module ownership**: which agent owns which path under `packages/core/src/` and `server/src/`.
- **Branding centralization**: new `packages/core/src/branding.ts` with `BRAND` const consumed by every render path. Internal storage keys (`nexus_vault_v2`, `nexus_data_v1`, TrustedTypes policies) are migration-locked and stay as-is.

### Phase 0.5 — main.ts split (Agent A, ~3 days)

`packages/core/src/main.ts` (1002 lines, orchestration) splits into 4 single-responsibility modules to reduce blast-radius before parallel agent work begins. This is 2026 best practice ([LogRocket TypeScript at scale 2026](https://blog.logrocket.com/typescript-at-scale-2026/)) — feature-first decomposition with SRP-bounded files.

- `packages/core/src/bootstrap.ts` — `init()` flow, integrity check, persistent-storage request, theme/density init.
- `packages/core/src/hooks-wiring.ts` — all `setXHooks()` cross-module wires (preserves the current pattern verbatim).
- `packages/core/src/render-pipeline.ts` — `fullRender()` + `appRenderWorkspace()` + new `appRenderRail()` for adaptive AI suggestion partials.
- `packages/core/src/app-lock.ts` — `lockApp()`, `_resetIdleTimer()`, idle activity listeners.

`main.ts` becomes a 30-line composition root that imports + calls `init()`.

### Phase 1 — UI foundation + data model + onboarding (Agent A primary; Agent C scaffolds sync; Agent F verifies; ~6 weeks)

- **Design system** (`packages/core/src/ui/design-tokens.ts`, `ui/primitives/*`, `ui/components.ts` rebuild) — typography, color, spacing, motion, focus rings, density modes. Salvage `trapFocus` from existing components.ts.
- **3-card first-run picker** (`packages/core/src/views/onboarding.ts` new) — Template / Persona / AI Guide cards + small "Blank" link.
- **Persona templates** (`packages/core/src/personas/*.ts` new) — Closer, Maintainer, Investigator, Builder, Inspector. Each is a canvas layout preset.
- **Canvas shell** — extend the existing spatial canvas pattern from `packages/core/src/views/dashboard.ts` (DASH_DEFAULTS x/y/w/h/z) and `packages/core/src/views/project-canvas.ts` (PC_DEFAULTS) into a generic per-workspace canvas system. New: `packages/core/src/views/workspace-canvas.ts`.
- **Hybrid data model** — add `deals` and `pipelines` to `STORES` in `constants.ts`; add `customFieldDefs`, `aiAttributeDefs`, `aiAttributeValues`, `extensionObjectDefs`, `extensionObjectInstances`, `workspaceLayouts`, `personaProfiles`, `automationRules`, `agentInsights` to `IDB_STORES`. Each store wired through `_idbPutRecord` / `_idbLoadStore` per CLAUDE.md.
- **Schemas extended** — every Valibot schema in `packages/core/src/schemas/` adds `customFields?: Record<string, unknown>` and `aiAttributes?: Record<string, AIAttributeValue>`. Add new schemas: `deal.schema.ts`, `pipeline.schema.ts`, `custom-field.schema.ts`, `ai-attribute.schema.ts`, `extension-object.schema.ts`, `workspace-layout.schema.ts`, `persona.schema.ts`.
- **State extended** — `packages/core/src/state.ts` adds typed collections, `workspace` (layout/persona/canvas blocks), `deals`, `pipelines`, `extensionObjects`, `aiAttributeValues`, `adaptiveSuggestions`, `lockdownLevel`.
- **Branding centralization** — new `packages/core/src/branding.ts`.
- **Sidebar/Topbar/Settings split** — `views/sidebar.ts` adds adaptive nav per persona; `views/topbar.ts` rebuild with search-bar centerpiece + AI button + persona avatar; `views/settings.ts` splits into `views/settings-user.ts` + `views/admin-console.ts` (role-gated).

### Phase 2 — AI v1 maximal (Agent B primary; Agent A integrates UI; Agent C wires compute endpoint; Agent F verifies; ~10 weeks)

- **AI Attributes engine** (`packages/core/src/ai/attributes-engine.ts` new) — compute scheduling, provenance recording, cache + refresh. Runs in `requestIdleCallback`. Triggered on related-record changes via existing `dbCreate/dbUpdate/dbDelete` hooks in `storage/db.ts`.
- **AI Attributes UI** — inline AI Attribute fields on every record modal (`views/record-modal.ts` extension), workspace columns (`views/workspace.ts` extension), provenance popover component.
- **Command intent** — `Cmd+K` palette in `ui/components.ts` rebuild → natural language → AI parses → preview action sheet → confirm or cancel. Wired through existing AI tool catalog (`ai/ai-tools.ts`) extended with command-intent tools.
- **Conversational AI panel rebuild** (`ai/ai-ui.ts` REBUILD) — context-aware sidebar; "Ask about this record" / "Ask about this workspace" buttons; voice input.
- **Adaptive suggestion engine** (`packages/core/src/ai/adaptive-engine.ts` new) — observes user actions, proposes layout changes via `adaptiveSuggestions` state slice. User approves explicitly; no auto-apply.
- **Summaries** — extends existing `ai-tools.ts` `summarize_record` tool with HIPAA-classified field skip + lockdown-aware routing.
- **Voice input** (`packages/core/src/voice-input.ts` new) — Web Speech API. Mic button component in `ui/components.ts`. Disabled for `hipaaClassified` fields. Lockdown-mode-aware.
- **Server compute endpoint** (`server/src/api/routes/ai-attributes.ts` new) — `POST /api/v1/ai/attributes/:id/compute` for builds where browser AI is unavailable; routes through tenant-controlled Ollama/Azure OpenAI only.
- **EU AI Act transparency** — every AI Attribute UI shows (ℹ) info icon → opens transparency panel (data read, model, timestamp, confidence, "advisory only, no automated decisions"). `ai_attribute_computed` audit event written on every compute.
- **Prompt-injection defense** — existing pattern preserved in `ai/ai-tools.ts` `aiSystemPromptBase()` (`<crm_data>`/`<user_record>` boundary instructions).

### Phase 3 — Sync + Admin Console (Agent C primary; Agent A builds admin UI; Agent F verifies; ~8 weeks)

- **Adapter rewrite** — `packages/adapter-rxdb/src/index.ts` rewrites from CouchDB protocol to RxDB 3-endpoint protocol against Hono server. Per [RxDB official docs](https://rxdb.info/replication.html), CouchDB protocol is unsuitable for fast client-side apps (too many HTTP requests, must store revision tree on client). The existing CouchDB code is preserved as an optional alternative adapter (`packages/adapter-rxdb-couchdb/`).
- **Server sync endpoints** (`server/src/api/routes/sync.ts` new) — `POST /api/v1/sync/pull`, `POST /api/v1/sync/push`, `GET /api/v1/sync/stream`. Wraps `withTenant()` + `writeAuditEvent()` per request.
- **Admin Console UI** (`packages/core/src/views/admin-console.ts` new) — sections: Org Settings (Lockdown level, IdP, retention, compliance pack toggles), Users & Roles, AI Endpoints allowlist, Audit Log viewer + search + export, Integration Manager, Billing (Stripe Customer Portal redirect). Linear-quality, not Power-Apps-form. Role-gated (admin/owner only).
- **Admin Console API** (`server/src/api/routes/admin.ts` EXTEND) — org settings CRUD, AI endpoints allowlist CRUD, audit log search + export, integration management.
- **Apps wiring**:
  - `apps/pwa-sync/src/entry.ts` REFACTOR — point to our Hono server's `/api/v1/sync/*` endpoints, drop the `VITE_COUCHDB_URL` hardcode.
  - `apps/enterprise-web/src/entry.ts` REBUILD — wire OIDC (existing `server/src/auth/oidc-service.ts`), `RxDBHonoAdapter`, `KmsKeyService` (existing `server/src/kms/key-service.ts`), OPA policy engine (existing `server/src/middleware/opa.ts`), OTel, then `init()`.

### Phase 4 — Lockdown Mode + Compliance Pack (Agent C primary; Agent B enforces AI boundary; Agent F verifies; ~6 weeks)

- **Lockdown enforcement client-side** — `packages/core/src/deployment-policy.ts` EXTEND adds `lockdownLevel: 'off' | 'standard' | 'strong' | 'strict'` + per-level capabilities. UI affordances react to level (greyed-out with explanation when disabled, not hidden). CSP `connect-src` enforced via build-time directive.
- **Lockdown enforcement server-side** — new middleware `server/src/middleware/lockdown.ts` blocks AI gateway calls to non-tenant endpoints when lockdown is Strong+. Existing `server/src/ai-gateway/policy-engine.ts` extends model allowlist check with tenant-allowed providers.
- **Immutable hash-chained audit log** — `security/audit.ts` (client) + `server/src/db/schema/audit-events.ts` (server) extend with `prev_hash text`, `signed_digest text NOT NULL`, `chain_position bigserial`. Append-only DB role grants enforce non-mutation. Retention 6 years (HIPAA-compatible) configurable to 1y/3y/7y per profile.
- **DLP-light** — copy/external-link/export warnings + audit-log events. Warns but allows (per "Strong" level decision); reserve full DLP block for future "Strict" tier.
- **Compliance pack** — admin-console toggleable bundles per regulation: HIPAA (6-year audit + PHI field opt-in + voice disabled on PHI), EU AI Act (transparency labels + FRIA template + AI activity log export), SOC 2 (admin access controls + audit + change-management proof), CCPA (data export + erasure workflow surface).
- **GDPR erasure surface** — existing `server/src/kms/erasure-workflow.ts` (KMS crypto-shredding) gets an admin-console UI for legitimate erasure requests.

### Phase 5 — Dataverse + Vertical Packs (Agent D primary; Agent A small UI tweaks; Agent F verifies; ~8 weeks)

- **DataverseAdapter implementation** — `packages/adapter-dataverse/src/index.ts` rewrites the documented stub into a real OData v4 implementation: pull (filter by `modifiedon`), push (PATCH with `If-Match: *` / `If-None-Match: *` upsert), stream (Dataverse change notifications), clear ($batch delete). Uses MSAL token from `apps/dataverse/src/entry.ts`.
- **Power Platform AI integration** — Dataverse build uses Power Platform Copilot / AI Builder for AI Attributes compute (per Dataverse-AI decision: "Power Platform AI first, browser AI as fallback"). New `packages/core/src/ai/providers/powerplatform.ts`.
- **Power Apps Code App packaging** — `apps/dataverse/vite.config.ts` EXTEND with Code App bundle requirements.
- **Vertical packs** — rolling delivery. Start with OT/ICS pack: terminology overlay (agency/contract/asset/work-order), persona ("Operator", "Field Engineer"), Lockdown-default Strong, extension objects (Asset, Work Order, Site, Compliance Audit). Healthcare, Consulting, Government packs follow as terminology + template overlays only.

### Phase 6 — Mobile + Public OSS Release (Agent E + Agent A; Agent F verifies; ~6 weeks)

- **Mobile PWA install profile** — `apps/mobile/src/entry.ts` REBUILD as PWA install variant of enterprise build. Mobile-optimized canvas layouts (touch targets, single-column collapse), service worker for offline shell, install manifest with branding from `branding.ts`. NOT Capacitor (deferred until specific native needs).
- **Public OSS release** — public GitHub repo, AGPLv3 license file, contributor docs, security disclosure policy, changesets pipeline (already wired in root `package.json`). Public launch announcement after all 4 builds are solid.
- **Azure SaaS hosting offering** — Azure App Service + Azure Postgres + Azure Key Vault deploy infrastructure. Matches existing project-completion decisions. Self-host docker-compose + Helm chart ship first; SaaS layer added after community feedback validates demand.

### Concurrency plan with 3 subscription slots

| Phase   | Concurrent agents                                                               | Idle agents | Tools                                                         |
| ------- | ------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| **0**   | Architect (user) + 1 reviewer                                                   | rest        | Claude Opus 4.7                                               |
| **0.5** | Agent A                                                                         | rest        | Claude Opus 4.7                                               |
| **1**   | Agent A (UI primary) + Agent C (sync skeleton) + Agent F (verifier)             | B, D, E     | A=Claude Opus 4.7, C=Codex GPT-5.5, F=Claude Sonnet 4.6       |
| **2**   | Agent B (AI primary) + Agent A (UI integration) + Agent F (verifier)            | C, D, E     | B=Claude Opus 4.7, A=Claude Sonnet 4.6, F=Claude Sonnet 4.6   |
| **3**   | Agent C (server primary) + Agent A (admin UI) + Agent F (verifier)              | B, D, E     | C=Codex, A=Claude Sonnet 4.6, F=Claude Sonnet 4.6             |
| **4**   | Agent C (lockdown enforcement) + Agent B (AI boundary) + Agent F (verifier)     | A, D, E     | C=Codex, B=Claude Opus 4.7, F=Claude Sonnet 4.6               |
| **5**   | Agent D (Dataverse primary) + Agent A (any UI adjustments) + Agent F (verifier) | B, C, E     | D=Codex, A=Claude Sonnet 4.6, F=Claude Sonnet 4.6             |
| **6**   | Agent E (mobile primary) + Agent A (responsive layouts) + Agent F (verifier)    | B, C, D     | E=Claude Sonnet 4.6, A=Claude Sonnet 4.6, F=Claude Sonnet 4.6 |

Total wall-clock: ~5 months to v1 ship (Phase 1+2 complete), ~10 months to enterprise GA (Phase 4 complete), ~12 months to Phase 6 complete and public OSS launch.

---

## Critical files to modify

### Phase 0 — new contracts files

- `C:\Users\JoshuaRandall\.claude\plans\ok-all-2026-versions-eager-hedgehog\01-CONTRACTS.md` (extract from this plan; agents pin to it)

### Phase 0.5 — main.ts split

- `d:\techkeycrmapp\packages\core\src\main.ts` (refactor, ~1002 → ~30 lines)
- `d:\techkeycrmapp\packages\core\src\bootstrap.ts` (new)
- `d:\techkeycrmapp\packages\core\src\hooks-wiring.ts` (new)
- `d:\techkeycrmapp\packages\core\src\render-pipeline.ts` (new)
- `d:\techkeycrmapp\packages\core\src\app-lock.ts` (new)

### Phase 1 — UI foundation + data model

- `d:\techkeycrmapp\packages\core\src\branding.ts` (new)
- `d:\techkeycrmapp\packages\core\src\constants.ts` (extend STORES + IDB_STORES)
- `d:\techkeycrmapp\packages\core\src\state.ts` (refactor with typed collections + workspace state)
- `d:\techkeycrmapp\packages\core\src\deployment-policy.ts` (extend with lockdownLevel + new profiles)
- `d:\techkeycrmapp\packages\core\src\schemas\*.schema.ts` (extend all 15 with customFields + aiAttributes; add deal/pipeline/custom-field/ai-attribute/extension-object/workspace-layout/persona)
- `d:\techkeycrmapp\packages\core\src\ui\design-tokens.ts` (new)
- `d:\techkeycrmapp\packages\core\src\ui\components.ts` (rebuild)
- `d:\techkeycrmapp\packages\core\src\ui\primitives\*.ts` (new directory)
- `d:\techkeycrmapp\packages\core\src\views\onboarding.ts` (new)
- `d:\techkeycrmapp\packages\core\src\views\workspace-canvas.ts` (new — extends dashboard.ts + project-canvas.ts patterns)
- `d:\techkeycrmapp\packages\core\src\personas\*.ts` (new directory — 5 persona presets)
- `d:\techkeycrmapp\packages\core\src\views\sidebar.ts` (refactor for adaptive nav)
- `d:\techkeycrmapp\packages\core\src\views\topbar.ts` (rebuild)
- `d:\techkeycrmapp\packages\core\src\views\settings.ts` (split into settings-user.ts + admin-console.ts)

### Phase 2 — AI v1 maximal

- `d:\techkeycrmapp\packages\core\src\ai\ai-runtime.ts` (refactor with provenance + commands + adaptive)
- `d:\techkeycrmapp\packages\core\src\ai\ai-tools.ts` (extend tool catalog)
- `d:\techkeycrmapp\packages\core\src\ai\ai-ui.ts` (rebuild)
- `d:\techkeycrmapp\packages\core\src\ai\attributes-engine.ts` (new)
- `d:\techkeycrmapp\packages\core\src\ai\adaptive-engine.ts` (new)
- `d:\techkeycrmapp\packages\core\src\voice-input.ts` (new)
- `d:\techkeycrmapp\server\src\api\routes\ai-attributes.ts` (new)

### Phase 3 — Sync + Admin

- `d:\techkeycrmapp\packages\adapter-rxdb\src\index.ts` (rewrite from CouchDB to RxDB 3-endpoint Hono-native)
- `d:\techkeycrmapp\packages\adapter-rxdb-couchdb\src\index.ts` (new — preserves current CouchDB code)
- `d:\techkeycrmapp\server\src\api\routes\sync.ts` (new)
- `d:\techkeycrmapp\server\src\api\routes\admin.ts` (extend)
- `d:\techkeycrmapp\packages\core\src\views\admin-console.ts` (new)
- `d:\techkeycrmapp\apps\pwa-sync\src\entry.ts` (refactor)
- `d:\techkeycrmapp\apps\enterprise-web\src\entry.ts` (rebuild — currently `export {}`)

### Phase 4 — Lockdown + Compliance

- `d:\techkeycrmapp\packages\core\src\security\audit.ts` (refactor with hash-chain + 6y retention)
- `d:\techkeycrmapp\server\src\db\schema\audit-events.ts` (extend with prev_hash + signed_digest + chain_position)
- `d:\techkeycrmapp\server\src\middleware\lockdown.ts` (new)
- `d:\techkeycrmapp\server\src\ai-gateway\policy-engine.ts` (extend with tenant-allowed providers)
- `d:\techkeycrmapp\packages\core\src\compliance\*.ts` (new directory — per-regulation packs)

### Phase 5 — Dataverse

- `d:\techkeycrmapp\packages\adapter-dataverse\src\index.ts` (rebuild — currently stub)
- `d:\techkeycrmapp\packages\core\src\ai\providers\powerplatform.ts` (new)
- `d:\techkeycrmapp\apps\dataverse\src\entry.ts` (extend with MSAL + DATAVERSE profile)
- `d:\techkeycrmapp\apps\dataverse\vite.config.ts` (extend with Code App requirements)
- `d:\techkeycrmapp\packages\core\src\verticals\ot-ics\*.ts` (new — first vertical pack)

### Phase 6 — Mobile + OSS

- `d:\techkeycrmapp\apps\mobile\src\entry.ts` (rebuild as PWA install profile)
- `d:\techkeycrmapp\apps\pwa-sync\public\manifest.json` (extend with branding)
- `d:\techkeycrmapp\LICENSE` (new — AGPLv3)
- `d:\techkeycrmapp\CONTRIBUTING.md` (new)
- `d:\techkeycrmapp\SECURITY.md` (move from `originalfiles/`, update)

### Files we explicitly DO NOT modify (KEEP as-is)

- `packages/core/src/security/{crypto,vault,session,trusted-types,sanitize,auth,mfa,totp,webauthn}.ts` — production-grade, 2026-current
- `packages/core/src/storage/{idb-data,fs}.ts` — production-grade
- `packages/core/src/utils.ts` — pure helpers
- `packages/core/src/ui/icons.ts` — extend only by adding new icons
- All 9 AI provider files in `packages/core/src/ai/providers/` — KEEP and add `powerplatform.ts`
- `packages/adapter-null/`, `packages/adapter-kms/`, `packages/adapter-mobile-native/*` (designs)
- `server/src/{db/index,db/migrate,middleware/cors,middleware/opa,observability/*,kms/*,auth/*,services/base,api/routes/health}.ts`
- `server/policies/crm.rego` — extend with new actions only
- `generate-csp.mjs` — extend only if new build target needs CSP
- `config/vite/base.config.ts` — extend aliases only
- All 6 build profile files in `config/build-profiles/` — extend with lockdown fields

---

## Verification plan

### Per-phase automated gates (Agent F runs after every weekly merge)

1. **Typecheck**: `pnpm run typecheck` — zero errors required.
2. **Lint**: `pnpm run lint` — zero errors required.
3. **Unit tests**: `pnpm test` — all green required.
4. **Build**: `pnpm run build:offline && pnpm run build:sync && pnpm run build:dataverse` — all three succeed.
5. **CSP integrity**: `node generate-csp.mjs dist/offline/index.html` (auto-runs in build:offline). `.sha256` file regenerated.
6. **Bundle size**: `pnpm run assert:offline-bundle && pnpm run assert:bundle-size` — within limits (existing scripts).
7. **Playwright e2e**: open `dist/offline/index.html`, run smoke test (first-run picker → persona → create record → AI Attribute computes → log out → log in → record persists). Lockdown variant test: simulate Strong lockdown, verify CSP blocks unauthorized AI endpoints, verify clipboard warning fires.
8. **axe-core accessibility**: WCAG 2.2 AA target, audit mode (report, do not block) until baseline reached.
9. **Security checks**: `pnpm audit` for transitive vulns; SRI check for any CDN reference (there should be none in offline build).
10. **Verifier report**: written to `verifier/phase-N-week-M.md` — pass/fail per gate, files touched, regression suggestions.

### Per-phase manual acceptance criteria

- **Phase 0**: `CONTRACTS.md` exists, each agent can summarize their owned section back to the user without ambiguity.
- **Phase 0.5**: `main.ts` is ≤50 lines, no behavior change; existing `pnpm run build:offline` produces a working `dist/offline/index.html`.
- **Phase 1**: First-run 3-card picker appears on fresh vault; persona selection produces tailored canvas; deal entity creates and persists; extension object definition saves and renders in workspace.
- **Phase 2**: AI Attribute defined via natural-language prompt, computes on browser AI (Chrome/Edge), shows full provenance in (ℹ) popover; `Cmd+K` natural-language command produces preview action sheet; voice input populates a task title field; AI sidebar answers a "what changed last week?" question grounded in CRM data.
- **Phase 3**: Two browsers signed into the same enterprise tenant. Edit a record in one → propagates to the other within sync interval. Conflict resolution UI surfaces when the same field is edited on both. Admin console lists users, lockdown level, audit log.
- **Phase 4**: With Strong lockdown active, attempting an AI call to `api.anthropic.com` is blocked by CSP. Audit log shows hash-chain integrity (`prev_hash` matches prior row's `signed_digest`). DLP-light warns on external link click.
- **Phase 5**: Dataverse build loads as Power Apps Code App, MSAL acquires token, OData read/write succeeds, Power Platform AI Builder answers a request, all subject to tenant DLP.
- **Phase 6**: PWA installable on iOS 17.4+ / Android Chrome from `apps/pwa-sync` build. Public GitHub repo published under AGPLv3. Self-host docker-compose + Helm chart spin up a working enterprise instance.

### Smoke test command (post Phase 1)

```bash
# In a fresh checkout
pnpm install
pnpm run build:offline
# Open dist/offline/index.html in Chrome
# Expected: 3-card first-run picker appears
```

### Smoke test command (post Phase 3 — enterprise)

```bash
# Server
cd server
pnpm install
cp .env.example .env  # fill in DATABASE_URL, ENTRA_*, AZURE_KV_URL
pnpm run db:migrate
pnpm run db:seed
pnpm run dev
# In another terminal
cd ..
pnpm run build:sync
# Serve dist/sync/index.html and visit in browser
# Expected: Entra ID login → workspace loads with seeded data → AI Attribute computes via tenant Ollama endpoint
```

---

## CONTRACTS (Phase 0 lockfile content — frozen before parallel agent work)

This section IS `CONTRACTS.md` for Phase 0. Every agent reads this section verbatim before touching code. Changes require user approval; never agent-to-agent mutation.

### C.1 Data model — hybrid

**Fixed core entities** (code-defined, in `packages/core/src/schemas/`, Valibot `looseObject`):

- `client`, `department`, `project`, `task`, `person`, `communication`, `file`, `timeEntry`, `tag`, `notification`, `document`, `conversation`, `standaloneNote` (existing)
- `deal` (NEW — `schemas/deal.schema.ts`)
- `pipeline` (NEW — `schemas/pipeline.schema.ts`)

Every entity schema gains:

```ts
customFields: v.optional(v.record(v.string(), v.unknown()), {})
aiAttributes: v.optional(v.record(v.string(), v.unknown()), {})
extensionLinks: v.optional(v.array(v.object({ defId: v.string(), instanceId: v.string() })), [])
```

**Extension objects** (user-definable, stored in IDB):

- `ExtensionObjectDef` (id, name, label, fields[], icon, color, allowedRelations[], createdAt, updatedAt)
- `ExtensionObjectInstance` (id, defId, fields, tenantId, customFields, aiAttributes, createdAt, updatedAt, deletedAt?)

**New IDB stores** (add to `IDB_STORES` in `constants.ts`):
`customFieldDefs`, `aiAttributeDefs`, `aiAttributeValues`, `extensionObjectDefs`, `extensionObjectInstances`, `workspaceLayouts`, `personaProfiles`, `automationRules`, `agentInsights`

**New CRM stores** (add to `STORES` in `constants.ts`):
`deals`, `pipelines`

### C.2 AI Attribute shape

```ts
interface AIAttributeDef {
  id: string // uuid
  entityType: string // 'client' | 'deal' | ... | extensionObjectDef.id
  fieldKey: string // snake_case key under aiAttributes
  label: string
  prompt: string // natural-language instruction
  dataSources: Array<{
    // which related fields/records to read
    kind: 'field' | 'relation' | 'communications' | 'history'
    path: string
  }>
  model: { tier: 'browser' | 'ollama' | 'cloud' | 'powerplatform'; preferredModelId?: string }
  refreshInterval: 'on_change' | 'daily' | 'weekly' | 'manual'
  hipaaClassified: boolean
  euAiActScope: 'operational' | 'decision-support'
  createdAt: string
  updatedAt: string
}

interface AIAttributeValue {
  defId: string
  recordId: string
  entityType: string
  value: string | number | boolean | null
  provenance: {
    provider:
      | 'browser-nano'
      | 'browser-transformers'
      | 'ollama'
      | 'anthropic'
      | 'openai'
      | 'google'
      | 'powerplatform'
    modelId: string
    computedAt: string // ISO
    computeDurationMs: number
    confidence: number | null // 0-1 if provider reports it
    inputDataHashes: string[] // SHA-256 of each data source — proves what was read
    promptHash: string // SHA-256 of the resolved prompt
  }
  errorState?: { message: string; lastAttemptAt: string }
}
```

### C.3 Sync protocol — RxDB 3-endpoint Hono-native

Replaces the existing CouchDB protocol in `packages/adapter-rxdb/src/index.ts`. Per [RxDB official docs](https://rxdb.info/replication.html), the CouchDB protocol is unsuitable for fast client-side apps.

**Endpoints** (on existing Hono v4 server, mounted at `/api/v1/sync/*`):

- `POST /api/v1/sync/pull` — body: `{ checkpoint: unknown, limit: number }`. response: `{ documents: Array<DocWithRev>, checkpoint: unknown }`.
- `POST /api/v1/sync/push` — body: `{ changeRows: Array<{ newDocumentState: Doc, assumedMasterState?: Doc }> }`. response: `{ conflicts: Array<Doc> }`.
- `GET /api/v1/sync/stream` — Server-Sent Events. emits: `{ documents: Array<DocWithRev>, checkpoint: unknown }` per server change.

Every endpoint wraps `withTenant(tenantId, fn)` and writes a `sync_pull` / `sync_push` audit event before responding.

**Document shape on wire**:

```ts
interface DocWithRev {
  id: string
  store: string // which entity/store this belongs to
  rev: string // server-issued revision marker (monotonic per (store, id))
  data: Record<string, unknown> // entity fields
  _deleted?: boolean
  updatedAt: string // ISO
}
```

**Conflict handler** (RxDB-side): merge `customFields` (union, newer-wins per key), merge `tags` (union), all other fields → newer `updatedAt` wins. For AI Attributes: server value wins if it has higher-quality provenance (cloud > ollama > browser); otherwise newer `computedAt` wins.

### C.4 Design tokens

New file `packages/core/src/ui/design-tokens.ts` exports:

```ts
export const TOKENS = {
  color: {
    /* semantic palette: bg/surface/border/text/accent x light+dark */
  },
  spacing: { 0: '0', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px', 12: '48px' },
  radius: { sm: '4px', md: '8px', lg: '12px', xl: '20px', full: '9999px' },
  motion: { fast: '120ms', base: '200ms', slow: '320ms', curve: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  typography: {
    /* family, sizes, weights, line-heights */
  },
  density: { comfortable: { row: '44px', gap: '12px' }, compact: { row: '32px', gap: '8px' } },
  shadow: {
    /* subtle/raised/overlay */
  },
} as const
```

All visual primitives consume `TOKENS`. CSS variables emitted at `:root` for theme + density data-attributes.

### C.5 AI provider interface

Existing pattern in `packages/core/src/ai/ai-runtime.ts` is preserved. New requirements:

- Every provider call returns `{ text, tokensIn, tokensOut, provenance: { modelId, computeDurationMs, confidence?: number } }`.
- All providers respect `assertLocalAIEndpointAllowed(url)` from `deployment-policy.ts` before any fetch.
- Lockdown enforcement happens at `aiRuntime.callBackend()` — if `deploymentPolicy.lockdownLevel === 'strong'`, only tenant-allowed endpoints are reachable; public providers throw `LockdownViolationError`.

### C.6 Audit event shape (hash-chained)

Client-side (`security/audit.ts`):

```ts
interface AuditEntry {
  id: string
  ts: string // ISO
  event: AuditEventType
  details: Record<string, string>
  ua: string
  chainPosition: number // 1-indexed
  prevHash: string | null // SHA-256 of previous entry's canonical form
  signedDigest: string // SHA-256 of canonical form of THIS entry minus signedDigest
}
```

Server-side (`server/src/db/schema/audit-events.ts` extension):

```ts
prevHash: text('prev_hash'),
signedDigest: text('signed_digest').notNull(),
chainPosition: bigserial('chain_position', { mode: 'number' }),
// unique (org_id, chain_position) — enforces chain order
```

**New event types** (extend `AuditEventType` in `security/audit.ts` and `audit.schema.ts`):

- `ai_attribute_computed`, `ai_attribute_failed`
- `ai_command_executed`, `ai_command_rejected`
- `ai_chat_message`
- `adaptive_suggestion_proposed`, `adaptive_suggestion_accepted`, `adaptive_suggestion_dismissed`
- `dlp_warning_shown`, `dlp_action_proceeded`
- `lockdown_violation_blocked`
- `sync_pull`, `sync_push`, `sync_conflict_resolved`
- `extension_object_defined`, `extension_object_instance_created`, `extension_object_instance_updated`, `extension_object_instance_deleted`
- `workspace_layout_changed`, `persona_selected`, `persona_changed`

### C.7 Lockdown enforcement boundaries

**Client-side gates** (controlled by `deploymentPolicy.lockdownLevel`):

- `off`: no restrictions.
- `standard`: tenant-only AI + immutable audit + telemetry blocked.
- `strong`: standard + DLP-light warnings on copy/external-link/export.
- `strict` (reserved, deferred): strong + hardware-bound keys + no clipboard + no external links.

Files that read `lockdownLevel`:

- `packages/core/src/ai/ai-runtime.ts` (blocks public providers)
- `packages/core/src/views/admin-console.ts` (shows level + per-feature switches)
- `packages/core/src/ui/components.ts` (DLP warning component)
- `packages/core/src/main.ts` → `bootstrap.ts` (CSP meta tag check at init)
- `packages/core/src/views/topbar.ts` (lockdown banner indicator)

**Server-side gates** (Hono middleware in `server/src/middleware/lockdown.ts`):

- Blocks AI gateway routes from calling non-tenant-allowed providers
- Adds `X-Lockdown-Level` header on every response (so clients can verify)
- Refuses to write audit events that don't include `prev_hash` (hash-chain integrity)

### C.8 Module ownership boundaries

| Path                                                                                                                                                        | Owner                                                         | Notes                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `packages/core/src/ui/`, `views/`, `personas/`                                                                                                              | Agent A                                                       | All visual + interaction                         |
| `packages/core/src/ai/`                                                                                                                                     | Agent B                                                       | All AI logic                                     |
| `packages/core/src/security/audit.ts`                                                                                                                       | Agent C (cross-cut with B)                                    | Hash-chain owned by C; AI event types owned by B |
| `packages/core/src/storage/`                                                                                                                                | Agent C                                                       | Sync integration                                 |
| `packages/core/src/state.ts`, `constants.ts`, `bootstrap.ts`, `hooks-wiring.ts`, `render-pipeline.ts`, `app-lock.ts`, `branding.ts`, `deployment-policy.ts` | Agent A (with C review)                                       | Shared core                                      |
| `packages/core/src/schemas/`                                                                                                                                | Agent A authors new ones; Agent C extends server-side mirrors |                                                  |
| `packages/adapter-rxdb/`, `packages/adapter-dataverse/`, `packages/adapter-rxdb-couchdb/` (new)                                                             | Agent C / D                                                   | C owns RxDB; D owns Dataverse                    |
| `server/src/` (all)                                                                                                                                         | Agent C                                                       | Except Dataverse-specific routes if any          |
| `apps/offline-web/`                                                                                                                                         | Agent A                                                       |                                                  |
| `apps/pwa-sync/`                                                                                                                                            | Agent C                                                       |                                                  |
| `apps/enterprise-web/`                                                                                                                                      | Agent C                                                       |                                                  |
| `apps/dataverse/`                                                                                                                                           | Agent D                                                       |                                                  |
| `apps/mobile/`                                                                                                                                              | Agent E                                                       |                                                  |
| `tests/`, `verifier/` reports                                                                                                                               | Agent F                                                       |                                                  |
| `config/build-profiles/`                                                                                                                                    | Agent C (with A review)                                       |                                                  |
| `CONTRACTS` (this section)                                                                                                                                  | User                                                          | Never agent-mutated                              |

### C.9 Cross-agent integration rules

1. Each agent works in its own git branch named `agent-{a|b|c|d|e|f}/{phase-name}`.
2. Weekly user-supervised merge into `integration` branch. Agent F runs full verification before merge accepted.
3. No agent edits files owned by another agent without a `[handoff]`-tagged PR comment and user approval.
4. `CONTRACTS.md` change requests are PR comments tagged `[contract-change]` — user approves, all agents pull the new contract before continuing.
5. Each agent commits ≤200 lines per commit (smaller blast radius for review).
6. Schema/breaking changes go through Agent F's compatibility check first.

---

## Agent prompts (paste these into each subscription at phase start)

These are model-tuned per [Claude Code vs OpenAI Codex 2026 research](https://www.morphllm.com/comparisons/codex-vs-claude-code). Claude Opus 4.7 for hard multi-file work, Sonnet 4.6 for routine, Codex GPT-5.5 for CI/PR-native server work.

### Agent A — UI / UX (Claude Opus 4.7 primary, Sonnet 4.6 for routine)

> You are Agent A, the UI/UX workstream for the Tech Key CRM rebuild. You own all visual components, views, and onboarding flows under `packages/core/src/ui/`, `packages/core/src/views/`, `packages/core/src/personas/`, `packages/core/src/branding.ts`, `packages/core/src/state.ts`, `packages/core/src/bootstrap.ts`, `packages/core/src/hooks-wiring.ts`, `packages/core/src/render-pipeline.ts`, `packages/core/src/app-lock.ts`, `packages/core/src/constants.ts` (with Agent C review), all entity schemas in `packages/core/src/schemas/`, and the offline build entry under `apps/offline-web/`.
>
> Read `CONTRACTS.md` (Section C of `C:\Users\JoshuaRandall\.claude\plans\ok-all-2026-versions-eager-hedgehog.md`) before writing any code. Honor it verbatim. If you need a contract change, stop and emit a PR comment tagged `[contract-change]`.
>
> Read `CLAUDE.md` at the repo root in full. Every security rule there is non-negotiable. In particular: every user-visible string goes through `escH()` from `utils.ts` before innerHTML interpolation. Trusted Types policy `nexus-crm-raw` must remain the only registered raw-HTML policy.
>
> The existing dashboard.ts (DASH_DEFAULTS x/y/w/h/z) and project-canvas.ts (PC_DEFAULTS) already implement the spatial canvas pattern — extend, don't reinvent. The `renderX(state)` + `bindX(state?)` view contract is rigorously followed across all 16 existing views; preserve it.
>
> Schemas use Valibot (`import * as v from 'valibot'`) with `v.looseObject`. Never use Zod in client code.
>
> Phase 1 deliverables: design-tokens.ts, primitives/, components.ts rebuild, onboarding.ts (3-card picker), workspace-canvas.ts, 5 persona presets, branding.ts, extended schemas (all 15 + 7 new), constants.ts extended, state.ts refactor with workspace/persona/aiAttributeValues/lockdownLevel, sidebar adaptive nav, topbar rebuild, settings split into settings-user + admin-console.
>
> Use Claude Opus 4.7 for: state.ts refactor, design-tokens architecture, hooks-wiring (cross-module discipline), settings split. Use Sonnet 4.6 for: persona templates, individual schema extensions, primitive components, sidebar/topbar updates. Default to Opus for any change that touches 3+ files.
>
> Commit ≤200 lines per commit. Each commit message references the phase and the contract section being implemented.

### Agent B — AI Features (Claude Opus 4.7 primary, Sonnet 4.6 for routine)

> You are Agent B, the AI features workstream. You own all of `packages/core/src/ai/` (runtime, tools, ui, settings, prefs, attributes-engine, adaptive-engine, all 9 providers), plus `packages/core/src/voice-input.ts` and the AI event types in `packages/core/src/security/audit.ts` (with Agent C handling hash-chain).
>
> Read CONTRACTS Section C.2 (AI Attribute shape), C.5 (provider interface), C.6 (audit event types) before writing code. Honor verbatim.
>
> Read CLAUDE.md fully. The existing prompt-injection defense in `aiSystemPromptBase()` (the `<crm_data>` / `<user_record>` boundary instructions) must be preserved. AI runtime state lives on the mutable `aiRuntime` object — never use `export let` for AI state.
>
> Chrome Prompt API is production-stable in Chrome 148+ (May 2026). Edge has Phi-4-mini via the same surface. Desktop only — mobile builds need WebGPU/transformers.js fallback.
>
> Phase 2 deliverables: ai-runtime.ts refactored with provenance + commands + adaptive engine; ai-tools.ts extended with AI Attribute tools + command intent tools + adaptive UX tools; ai-ui.ts rebuilt (sidebar + inline Attributes + command bar + voice button + provenance popover); attributes-engine.ts (compute scheduler with `requestIdleCallback`, cache + refresh, lockdown-aware routing); adaptive-engine.ts (usage observation + layout proposal); voice-input.ts (Web Speech API + HIPAA field skip + lockdown gate).
>
> EU AI Act 2026 transparency is mandatory: every AI Attribute UI shows (ℹ) → opens transparency panel describing inputs, model, confidence, "advisory only, no automated decisions." Every Attribute compute writes `ai_attribute_computed` audit event with full provenance.
>
> Use Opus 4.7 for: attributes-engine, adaptive-engine, ai-runtime refactor, lockdown enforcement integration. Use Sonnet 4.6 for: provider tweaks, tool catalog additions, voice button component.
>
> Never call public AI APIs in the offline build. Offline build's deployment policy must already enforce this — verify in code before each AI provider call.

### Agent C — Server / Sync / Admin (OpenAI Codex GPT-5.5)

> You are Agent C, the server, sync, and admin workstream. You own all of `server/src/`, `packages/adapter-rxdb/`, `packages/adapter-rxdb-couchdb/` (new), `packages/core/src/storage/db.ts`, `packages/core/src/storage/idb-data.ts` (extend only), `packages/core/src/adapter-interface.ts`, the hash-chain logic in `packages/core/src/security/audit.ts`, `packages/core/src/views/admin-console.ts`, `apps/pwa-sync/`, `apps/enterprise-web/`, `config/build-profiles/` (with Agent A review).
>
> Read CONTRACTS Section C.3 (sync protocol), C.6 (audit hash-chain), C.7 (lockdown), C.8 (ownership) before writing code.
>
> Read CLAUDE.md fully — server-side security rules section. Every DB query goes through `withTenant(tenantId, fn)`. Every create/update/delete writes `writeAuditEvent()`. Never expose raw SQL errors to HTTP responses. **Server routes now use Valibot** (migrated 2026-05-22) — schemas in `server/src/schemas/index.ts`, parsed via `safeParseV`. Match this convention in every new route you write.
>
> RxDB protocol REWRITE: replace the current CouchDB implementation in `packages/adapter-rxdb/src/index.ts` with the RxDB 3-endpoint protocol against our Hono server. Preserve the existing CouchDB code as `packages/adapter-rxdb-couchdb/src/index.ts` for users who want CouchDB compatibility. Per [RxDB official docs](https://rxdb.info/replication.html), CouchDB protocol is unsuitable for fast client-side apps.
>
> Phase 3 deliverables: `server/src/api/routes/sync.ts` (pull, push, stream), `server/src/api/routes/admin.ts` EXTEND (org settings, AI endpoints allowlist, audit search/export, integration manager), `packages/adapter-rxdb/src/index.ts` rewrite, `apps/pwa-sync/src/entry.ts` refactor to point at our Hono server, `apps/enterprise-web/src/entry.ts` REBUILD (currently `export {}`).
>
> Phase 4 deliverables: hash-chain in `server/src/db/schema/audit-events.ts` (prev_hash, signed_digest, chain_position) + matching client-side hash-chain in `security/audit.ts`, `server/src/middleware/lockdown.ts` enforcement, `server/src/ai-gateway/policy-engine.ts` EXTEND with tenant-allowed providers, compliance pack toggle.
>
> Use Codex CLI's subagent feature (up to 8 parallel) for scaffolding: Drizzle schema generation for new entities, RLS migration generation, route boilerplate, service boilerplate. Use Codex's PR-native flow to ship one PR per logical change. Keep PRs ≤300 lines.
>
> Never use the PowerShell tool for pnpm/npm commands — use bash. When pnpm needs workspace root flag, use `-w`.

### Agent D — Dataverse / Power Platform (OpenAI Codex GPT-5.5)

> You are Agent D, the Dataverse Code App workstream. You own `packages/adapter-dataverse/`, `packages/core/src/ai/providers/powerplatform.ts` (new), `apps/dataverse/`, and Power Platform Code App build integration. You do NOT touch UI views — Agent A owns those. Agent C handles `apps/enterprise-web/`; you handle `apps/dataverse/`.
>
> Read CONTRACTS Section C.5 (provider interface) and C.8 (ownership) before writing code.
>
> Read CLAUDE.md fully. Same UI in all 4 builds — Dataverse build must render the EXACT SAME workspace UI as offline/enterprise/mobile. Only differences: storage adapter (DataverseAdapter), auth (Power Platform-provided), AI provider preference (Power Platform Copilot/AI Builder first, browser AI fallback).
>
> Phase 5 deliverables: `packages/adapter-dataverse/src/index.ts` rewrite from documented stub to real OData v4 implementation (pull/push/stream/clear); `packages/core/src/ai/providers/powerplatform.ts` for Copilot integration; `apps/dataverse/src/entry.ts` EXTEND with MSAL token acquisition + DATAVERSE_PROFILE deployment policy; `apps/dataverse/vite.config.ts` extension for Code App packaging; Dataverse table provisioning script.
>
> Dataverse table naming: `tktaskapp_<entity>` (per existing entityMap in `apps/dataverse/src/entry.ts`). Add tables for deals, pipelines, ai_attribute_definitions, ai_attribute_values, extension_object_definitions, extension_object_instances.
>
> Power Platform DLP, conditional access, and audit are inherited from the tenant — do NOT duplicate them in app code. Document which compliance assertions inherit and which Tech Key must provide on top.

### Agent E — Mobile / PWA (Claude Sonnet 4.6)

> You are Agent E, the mobile / PWA install profile workstream. You own `apps/mobile/`, the responsive layout extensions in shared UI components, and the PWA install manifest. You do NOT touch core UI architecture — Agent A owns those primitives; you consume them with mobile-specific overrides.
>
> Read CONTRACTS Section C.4 (design tokens density) and C.8 (ownership) before writing code.
>
> Read CLAUDE.md fully. Mobile = PWA install profile of the enterprise build. NOT Capacitor day-1.
>
> Phase 6 deliverables: `apps/mobile/src/entry.ts` REBUILD as PWA install variant of enterprise build (currently `export {}`); service worker for offline shell (already partially scaffolded in `apps/pwa-sync/public/manifest.json`); install manifest extension with branding from `packages/core/src/branding.ts`; mobile-optimized canvas layout extensions (touch targets ≥44px, single-column collapse below 640px); responsive image handling; mobile-specific keyboard avoidance.
>
> Test on real iOS 17.4+ Safari and Android Chrome. Web App Manifest must declare `display: standalone` and `start_url: /`. Service worker uses cache-first for app shell, network-first for API calls.

### Agent F — Verifier (Claude Sonnet 4.6)

> You are Agent F, the verifier. You do NOT write production code. Your job is to run the verification suite after every weekly merge to the `integration` branch and produce a phase-week report in `verifier/phase-N-week-M.md`.
>
> Read this entire plan file before each run.
>
> Per merge:
>
> 1. `pnpm install` (clean state)
> 2. `pnpm run typecheck` — zero errors required
> 3. `pnpm run lint` — zero errors required
> 4. `pnpm test` — all green required
> 5. `pnpm run build:offline && pnpm run build:sync && pnpm run build:dataverse` — all three succeed
> 6. `pnpm run assert:offline-bundle && pnpm run assert:bundle-size`
> 7. Playwright e2e smoke (first-run picker → persona → create record → AI Attribute computes → log out → log in → record persists)
> 8. Lockdown variant test (Strong lockdown active, CSP blocks unauthorized AI endpoints, DLP-light warning fires on copy)
> 9. axe-core run on `dist/offline/index.html` — WCAG 2.2 AA — audit-mode (report only)
> 10. `pnpm audit` for transitive vulns
>
> Report format: pass/fail per gate, files touched in the merge, regression suggestions, any contract violations. If a gate fails, block the merge in the report and tag the responsible agent.
>
> Use Sonnet 4.6 — this work is high-volume, pattern-matching, cost-sensitive.
>
> You may run additional consistency checks: are all `renderX/bindX` pairs balanced? Do new AI event types appear in both `security/audit.ts` types AND `schemas/audit.schema.ts` Valibot picklist? Do new storage keys appear in both `STORES` or `IDB_STORES` AND any code that reads them? Do persona presets all have the same field shape?
