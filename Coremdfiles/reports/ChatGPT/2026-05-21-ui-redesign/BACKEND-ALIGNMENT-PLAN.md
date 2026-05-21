# Backend Alignment Plan for the Redesigned UI

Assessment date: 2026-05-21

## Summary

The current offline frontend can support the first version of the redesigned UI with local IndexedDB and in-memory AI state. However, the future UI vision requires backend capabilities that are only partially present today.

The backend must evolve from CRUD routes into a **permission-aware work orchestration layer**: record graph, timeline, recommendations, agent runs, approvals, audit, semantic search, sync, and user/agent identity.

## Current Backend Fit

Already aligned:

- CRUD services for CRM entities.
- PostgreSQL schema with tenant columns.
- Row-level security design for CRM tables.
- OIDC, OPA, and audit architecture.
- AI gateway policy engine concept.
- KMS/GDPR crypto-shredding design.
- OpenTelemetry architecture.

Not yet aligned:

- Typecheck and workspace integration are failing.
- Server is not currently production-ready.
- No agent run model.
- No approval workflow model.
- No recommendation/task insight model.
- No unified activity timeline API.
- No relationship graph API.
- No semantic search/vector search.
- No sync conflict resolution API for offline-to-server.
- No durable AI memory/context vault.
- No agent identity/access controls.

## Backend Changes Required by UI Feature

| UI feature             | Backend need                                                                            | Current gap                                                            |
| ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Command Center         | Aggregated attention API: overdue, stale, risks, workload, recent changes               | Current frontend computes locally; server lacks aggregation endpoints. |
| Next best actions      | Recommendation engine and recommendation state: suggested, dismissed, snoozed, accepted | No persisted recommendations.                                          |
| AI action approvals    | Approval workflow table and API                                                         | Current AI approval is local/in-memory.                                |
| Agent Workbench        | Agent definitions, tool permissions, run queue, run logs                                | No agent persistence or execution model.                               |
| Agent Builder Lite     | Capability registry and tool schema registry                                            | Tools exist in frontend only.                                          |
| Record 360             | Timeline API, related-record API, health/risk fields                                    | Relationships exist but no unified graph/timeline layer.               |
| Relationship graph     | Edge table or generated relation API                                                    | Links are spread across entity fields.                                 |
| Narrative reports      | Reporting/query service, export jobs                                                    | Current reporting is frontend/local.                                   |
| Semantic search        | Embeddings/indexing, permission-aware retrieval                                         | No vector or FTS search service.                                       |
| Mobile/PWA sync        | Change log, conflict detection, cursor-based sync                                       | Adapters are stubs/partial.                                            |
| Enterprise AI trust UI | Model inventory, AI provider policy, prompt/response audit metadata                     | Policy docs exist; runtime persistence is partial.                     |

## Recommended API Additions

### 1. Command Center API

```http
GET /api/v1/command-center
```

Returns:

- attention items
- stale clients/projects
- overdue tasks
- workload summary
- recent activity
- pending approvals
- agent run status
- sync/security status

### 2. Timeline API

```http
GET /api/v1/timeline?store=clients&id=:id
```

Returns normalized events:

- record created/updated
- task changes
- communications
- notes
- files
- time entries
- AI recommendations/actions
- audit events visible to user

### 3. Relationship Graph API

```http
GET /api/v1/graph/record/:store/:id
```

Returns nodes and edges:

- client
- projects
- tasks
- people
- files
- notes/documents
- communications
- time entries

### 4. Recommendations API

```http
GET /api/v1/recommendations
POST /api/v1/recommendations/:id/snooze
POST /api/v1/recommendations/:id/dismiss
POST /api/v1/recommendations/:id/accept
```

Needed fields:

- id
- tenantId
- userId or audience
- type
- title
- summary
- evidenceRefs
- proposedAction
- confidence
- status
- snoozedUntil
- createdAt
- expiresAt

### 5. Agent Definitions API

```http
GET /api/v1/agents
POST /api/v1/agents
PATCH /api/v1/agents/:id
POST /api/v1/agents/:id/run
```

Needed fields:

- id
- name
- purpose
- instructions
- readScopes
- toolScopes
- writePolicy: blocked | draft | approval_required | auto_allowed
- trigger
- ownerId
- enabled
- version

### 6. Agent Runs API

```http
GET /api/v1/agent-runs
GET /api/v1/agent-runs/:id
POST /api/v1/agent-runs/:id/cancel
POST /api/v1/agent-runs/:id/approve-step
```

Needed fields:

- id
- agentId
- status
- startedBy
- trigger
- plan
- steps
- toolCalls
- evidenceRefs
- output
- error
- createdAt
- completedAt

### 7. Approval API

```http
GET /api/v1/approvals
POST /api/v1/approvals/:id/approve
POST /api/v1/approvals/:id/reject
```

Needed fields:

- id
- requesterType: user | agent
- requesterId
- actionType
- targetRef
- diff
- evidenceRefs
- riskLevel
- expiresAt
- approvedBy
- status

### 8. Capability Registry

```http
GET /api/v1/capabilities
```

Each capability should define:

- name
- description
- input schema
- output schema
- side effects
- required role/scope
- approval requirement
- idempotency behavior
- audit event type

This aligns with agent-interface research: future AI systems need machine-readable, composable, reliable invocable capabilities.

## Data Model Additions

Suggested tables:

- `activity_events`
- `record_edges`
- `recommendations`
- `agent_definitions`
- `agent_runs`
- `agent_run_steps`
- `agent_tool_calls`
- `approvals`
- `capability_registry`
- `ai_context_sources`
- `saved_views`
- `user_preferences`
- `sync_changes`
- `sync_conflicts`

## Auth and Policy Changes

The redesigned UI assumes trust controls that the backend must enforce:

1. **No implicit viewer access.** Unknown users must be denied.
2. **Agent identity.** Agents need identities distinct from human users.
3. **Agent scopes.** Every agent must have explicit read/write/tool scopes.
4. **Approval policy.** OPA should determine whether a tool call can run automatically, requires approval, or is blocked.
5. **Evidence-aware audit.** Every AI recommendation/action should link to evidence records and policy decisions.
6. **Tenant isolation tests.** Every new table must have RLS and integration tests.

## AI Gateway Changes

Current AI policy engine is a good start but should be expanded:

- Move model allowlist into DB/admin settings.
- Add tenant-level AI policy.
- Add provider-level DPA/data boundary flags.
- Store prompt metadata without storing sensitive prompt text by default.
- Track model, tokens, cost, latency, tool calls, approvals, outcome, and user feedback.
- Add prompt-injection detection events.
- Add retrieval permission filtering.
- Add redaction policy by field classification.

## Search and Knowledge Layer

For future UI quality, search cannot remain plain substring search.

Recommended layers:

1. Exact search: IDs, names, emails, titles.
2. Full-text search: notes, descriptions, communications, documents.
3. Relationship search: “projects for Acme due this month.”
4. Semantic search: “accounts at risk because nobody followed up.”

Offline implementation:

- Local token index in IndexedDB.
- Optional local embeddings later if browser model support is viable.

Enterprise implementation:

- PostgreSQL full-text search first.
- Optional `pgvector` or managed vector store later.
- Permission-aware retrieval enforced before AI context construction.

## Sync and Offline Considerations

The future UI should preserve offline-first behavior:

- Local actions should create local activity events.
- Agent recommendations can run locally where possible.
- Server sync should reconcile activity logs, recommendations, approvals, and agent runs.
- Conflict UI must show field-level diffs.
- AI-generated writes should be easy to revert.

Required backend:

- Change log per tenant/user/device.
- Sync cursors.
- Conflict records.
- Idempotency keys for writes and agent tool calls.
- Device identity.
- Last-write metadata and field-level merge support.

## Implementation Sequence

### Backend Phase 0: Fix foundation

- Add `server` to pnpm workspace.
- Make typecheck/lint/audit green.
- Fix Docker build.
- Upgrade Drizzle.
- Harden auth.

### Backend Phase 1: Activity and graph

- Add `activity_events`.
- Add timeline API.
- Add generated relationship graph endpoint.
- Add saved views/preferences.

### Backend Phase 2: Recommendation system

- Add recommendations table/API.
- Add deterministic recommendation rules first.
- Add AI-generated recommendation drafts later.

### Backend Phase 3: Agent control plane

- Add agent definitions/runs/steps/tool calls.
- Add capability registry.
- Add approval workflow.
- Add OPA policies for tools.

### Backend Phase 4: AI retrieval and observability

- Add permission-aware search/retrieval.
- Add AI gateway telemetry.
- Add model/provider policy admin UI.
- Add SIEM/export evidence.

### Backend Phase 5: Enterprise integrations

- Calendar/email integrations.
- External file connectors.
- Webhook/event triggers.
- MCP-compatible tool exposure if still strategically valuable.

## Critical Alignment Warning

Do not build autonomous background agents in the UI until the backend has:

- Durable run logs.
- Approval persistence.
- Agent identity.
- Scope enforcement.
- Idempotency.
- Audit events.
- Cancellation.
- Tenant-isolated retrieval.

Until then, keep agents as **local drafts and recommendations** that require explicit user approval before writes.
