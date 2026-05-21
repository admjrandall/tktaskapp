Task App CRM — Feature Implementation Prompts (2026)
Read CLAUDE.md in full before running any prompt. All security rules in that file are non-negotiable and must never be bypassed.

PROMPT 1 — Industry Vertical Profiles + Custom Fields Foundation

You are implementing Industry Vertical Profiles and Custom Fields as the foundational
layer for all new features in the Task App CRM monorepo (d:\techkeycrmapp).

Read CLAUDE.md fully before starting. Follow every security rule and architecture
pattern documented there. Search the internet for 2026 best practices if you are
unsure about any implementation decision.

CONTEXT:
The app ships as 5 builds: offline-web (browser-ai / no-ai / internal-ai sub-profiles),
pwa-sync, dataverse, mobile (Capacitor), enterprise-web. All new features must live in
packages/core/src/ (shared layer) so every build inherits them automatically.

The app is offline-first, AES-256-GCM encrypted. All data flows through
dbCreate/dbUpdate/dbDelete in storage/db.ts — never touch IndexedDB directly.
All user-visible strings must go through escH() before innerHTML interpolation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART A — INDUSTRY VERTICAL PROFILES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/vertical-profiles.ts

Define a VerticalProfile interface:
id: string (slug)
label: string
description: string
dealStagePresets: DealStagePreset[] (see Prompt 2 — use a forward-declared type for now)
defaultCustomFields: CustomFieldDefinition[] (see Part B)
leadScoringWeights: LeadScoringWeights (see Prompt 5)
terminology: Record<string, string> (e.g. { client: 'Client', deal: 'Deal', project: 'Project' })
aiPersona: string (short system-prompt fragment personalizing AI responses for this vertical)
complianceFlags: { hipaa: boolean; euAiAct: boolean; soc2: boolean; ccpa: boolean }

Ship 4 built-in profiles:

1. general-b2b — "General B2B / Professional Services"
   terminology: client/deal/project/task (standard)
   complianceFlags: { hipaa: false, euAiAct: true, soc2: false, ccpa: true }

2. healthcare — "Healthcare / Clinical"
   terminology: patient→client, referral→deal, case→project, action→task
   complianceFlags: { hipaa: true, euAiAct: true, soc2: false, ccpa: true }
   defaultCustomFields includes: NPI number, specialty, referring provider

3. government-ot — "Government / OT / Critical Infrastructure"
   terminology: agency/contract/project/task
   complianceFlags: { hipaa: false, euAiAct: false, soc2: true, ccpa: false }
   defaultCustomFields includes: clearance level, facility code, program office

4. consulting — "Consulting / IT Services"
   terminology: client/engagement/project/task
   complianceFlags: { hipaa: false, euAiAct: true, soc2: true, ccpa: true }

Export:
VERTICAL_PROFILES: VerticalProfile[]
getActiveProfile(): VerticalProfile
setActiveProfile(id: string): void — persists to localStorage key 'taskapp_vertical_v1'
getTerm(key: string): string — returns terminology override or key itself

On first launch, if no profile is stored, show a profile-selection modal (implement
in views/vertical-setup.ts following the render/bind pattern in CLAUDE.md).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART B — CUSTOM FIELDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/schemas/custom-field.schema.ts

Define CustomFieldDefinition (Zod schema):
id: string (uuid)
entityType: 'client' | 'contact' | 'deal' | 'project' | 'task' | 'person'
label: string
fieldKey: string (snake_case, used as property key on records)
fieldType: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'url' | 'email' | 'phone'
options?: string[] (for select/multiselect types)
required: boolean
defaultValue?: unknown
placeholder?: string
hipaaClassified: boolean (if true: field value is PHI — encrypt separately, audit on access)
visibleInList: boolean
sortOrder: number
createdAt: string
updatedAt: string

Custom field definitions are stored as a special encrypted record in the vault:
'**custom_fields**' in the documents IDB store (it is large-content, per CLAUDE.md rules:
add 'customFieldDefs' to IDB_STORES in constants.ts and route through \_idbPutRecord).

Custom field VALUES are stored as a `customFields: Record<string, unknown>` property
added to every entity record schema. Update all existing Zod schemas in
packages/core/src/schemas/ to include:
customFields: z.record(z.string(), z.unknown()).optional().default({})

Implement in packages/core/src/custom-fields.ts:
getCustomFieldDefs(entityType): CustomFieldDefinition[]
saveCustomFieldDefs(defs: CustomFieldDefinition[]): Promise<void>
addCustomField(def: Omit<CustomFieldDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomFieldDefinition>
updateCustomField(id, changes): Promise<void>
deleteCustomField(id): Promise<void>

Implement a Custom Fields admin UI in settings view (packages/core/src/views/settings.ts).
Add a "Custom Fields" section per entity type. UI must:

- List existing custom fields with type badge and HIPAA indicator
- Add / edit / delete fields
- Drag to reorder (update sortOrder)
- Show a preview of how the field renders on the record form

Implement renderCustomFields(entityType, record, mode: 'view'|'edit'): string
and bindCustomFields(entityType, record, onChange): void
in packages/core/src/ui/custom-fields-ui.ts
Call renderCustomFields/bindCustomFields from every existing record modal
(client, project, task, person, deal — deal is added in Prompt 2).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECURITY & COMPLIANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- All strings through escH() before innerHTML.
- HIPAA-classified custom field values must be tagged in the audit log when read.
- Profile selection must be re-confirmable from Settings so users can switch verticals.
- The vertical terminology system must be used throughout all new views added by
  subsequent prompts (use getTerm() everywhere, never hardcode "Deal", "Client" etc.).
- Update CLAUDE.md, TECHNICAL-REFERENCE.md, CHANGELOG.md to document custom fields
  IDB store and vertical profile system.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes
□ pnpm run build:offline produces a working dist/offline/index.html
□ First-launch profile selector appears when no profile is stored
□ Switching profile in Settings changes terminology throughout the UI
□ Custom field added to 'client' entity appears on client record modal
□ Custom field value persists through app reload
□ HIPAA-classified field access writes an audit event
PROMPT 2 — Deals Entity + Pipeline Schema

You are implementing the Deals entity and Deal Pipeline schemas in the Task App CRM
monorepo (d:\techkeycrmapp). This must be completed after PROMPT 1 (Vertical Profiles +
Custom Fields) is merged.

Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEAL STAGE PRESETS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/schemas/deal.schema.ts

DealStagePreset (Zod):
id: string
label: string
color: string (hex; used for Kanban column header)
probability: number (0-100; used for forecasting in Prompt 4)
isWon: boolean
isLost: boolean
sortOrder: number

Ship two named presets as constants (add to constants.ts):

PRESET_STANDARD_SALES: DealStagePreset[] = [
{ id: 'lead', label: 'Lead', color: '#94a3b8', probability: 10, isWon: false, isLost: false, sortOrder: 0 },
{ id: 'qualified', label: 'Qualified', color: '#60a5fa', probability: 30, isWon: false, isLost: false, sortOrder: 1 },
{ id: 'proposal', label: 'Proposal Sent', color: '#f59e0b', probability: 60, isWon: false, isLost: false, sortOrder: 2 },
{ id: 'negotiation', label: 'Negotiation', color: '#a78bfa', probability: 80, isWon: false, isLost: false, sortOrder: 3 },
{ id: 'won', label: 'Won', color: '#22c55e', probability: 100, isWon: true, isLost: false, sortOrder: 4 },
{ id: 'lost', label: 'Lost', color: '#ef4444', probability: 0, isWon: false, isLost: true, sortOrder: 5 },
]

PRESET_CONSULTING: DealStagePreset[] = [
{ id: 'prospect', label: 'Prospect', color: '#94a3b8', probability: 10, isWon: false, isLost: false, sortOrder: 0 },
{ id: 'discovery', label: 'Discovery', color: '#60a5fa', probability: 25, isWon: false, isLost: false, sortOrder: 1 },
{ id: 'scoping', label: 'Scoping', color: '#f59e0b', probability: 45, isWon: false, isLost: false, sortOrder: 2 },
{ id: 'proposal', label: 'Proposal', color: '#a78bfa', probability: 65, isWon: false, isLost: false, sortOrder: 3 },
{ id: 'contract', label: 'Contract', color: '#fb923c', probability: 85, isWon: false, isLost: false, sortOrder: 4 },
{ id: 'won', label: 'Won', color: '#22c55e', probability: 100, isWon: true, isLost: false, sortOrder: 5 },
{ id: 'lost', label: 'Lost', color: '#ef4444', probability: 0, isWon: false, isLost: true, sortOrder: 6 },
]

Assign presets to vertical profiles:
general-b2b → PRESET_STANDARD_SALES
consulting → PRESET_CONSULTING
healthcare → PRESET_CONSULTING (rename: Prospect→Referral, Contract→Authorization)
government-ot → PRESET_CONSULTING (rename: Proposal→SOW, Contract→Award)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEAL SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DealSchema (Zod):
id: string (uuid)
title: string
clientId: string (fk → clients)
personId?: string (fk → people; primary contact)
stageId: string (fk → active pipeline's stages)
pipelineId: string (fk → DealPipeline)
value: number (monetary; base currency)
currency: string (ISO 4217; default 'USD')
probability?: number (override; if null, inherit from stage)
closeDate?: string (ISO date; expected close)
actualCloseDate?: string (ISO date; set on won/lost)
ownerId?: string (userId; who owns this deal)
tags: string[]
notes?: string
lostReason?: string (required when stageId → isLost stage)
linkedProjectIds: string[] (projects spawned from this deal)
linkedTaskIds: string[]
leadScore?: number (computed by Prompt 5, stored here)
customFields: Record<string, unknown> (from Prompt 1)
createdAt: string
updatedAt: string
deletedAt?: string

DealPipelineSchema (Zod):
id: string
name: string
stages: DealStagePreset[]
isDefault: boolean
createdAt: string
updatedAt: string

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STORAGE WIRING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add 'deals' and 'pipelines' to STORES (not IDB_STORES) in constants.ts.
These are part of the vault flush (CRM stores), not individual IDB records.

Add deals: Deal[] and pipelines: DealPipeline[] to AppState in state.ts.
Add deals and pipelines to reloadData() in state.ts.
Add deals and pipelines to the dbFlush serialization in storage/db.ts.

On first launch (when no pipelines exist), auto-create the default pipeline
using the active vertical profile's dealStagePresets.

Export from packages/core/src/schemas/index.ts:
DealSchema, DealPipelineSchema, DealStagePresetSchema

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATAVERSE ENTITY MAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to apps/dataverse/src/entry.ts entityMap:
deals: 'tktaskapp_deals'
pipelines: 'tktaskapp_pipelines'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVER SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create Drizzle table definitions in server/src/db/schema/deals.ts:
deals table — all DealSchema fields, plus tenant_id TEXT NOT NULL, RLS policy.
deal_pipelines table — all DealPipelineSchema fields, plus tenant_id, RLS.

Create server/src/services/deals.ts following the exact pattern of existing service
files: all methods call withTenant() and writeAuditEvent().
Create server/src/api/routes/deals.ts with CRUD routes; Zod validation on all bodies.
Mount at /api/v1/deals and /api/v1/pipelines in server/src/index.ts.

Generate a Drizzle migration: pnpm --filter server db:generate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCEPTANCE CRITERIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ pnpm run typecheck passes (root + server)
□ pnpm run build:offline succeeds
□ AppState.deals and AppState.pipelines are populated on login
□ dbCreate('deals', deal) persists through app reload (vault flush)
□ Default pipeline is auto-created on first launch matching active vertical
□ Server migration file created and pnpm --filter server db:generate succeeds
□ Update CLAUDE.md STORES list to include deals and pipelines
PROMPT 3 — Pipeline / Kanban View

You are implementing the Pipeline (Kanban) view in the Task App CRM monorepo
(d:\techkeycrmapp). This depends on PROMPT 1 and PROMPT 2 being complete.

Read CLAUDE.md fully. Follow the render/bind pattern documented there exactly.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIEW FILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/views/pipeline.ts

Add 'pipeline' to the valid currentView values in state.ts and constants.ts.
Add 'pipeline' to the sidebar nav in the appropriate view (likely components.ts).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KANBAN BOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

renderPipeline(state: AppState): string

- Pipeline selector dropdown (if multiple pipelines exist)
- Toggle: Kanban | List | Forecast (Forecast implemented in Prompt 4)
- "New Deal" button (opens deal modal)
- Kanban board: one column per stage, horizontal scroll
- Each column shows: stage label, count badge, total value sum, deal cards
- Each deal card shows:
  title, client name, value (formatted with currency), close date,
  lead score badge (if available, from Prompt 5),
  overdue indicator (closeDate < today and not won/lost),
  assigned owner avatar/initials,
  tag chips (max 3, then "+N more")
- Cards are sorted within column by: lead score desc, then closeDate asc
- Won / Lost columns are collapsible (collapsed by default, show count)
- "Add Deal" inline button at the bottom of each column (except Won/Lost)

bindPipeline(state?: AppState): void

- Drag-and-drop between columns: use HTML5 native drag-and-drop API.
  On drop, call dbUpdate('deals', id, { stageId: newStageId, updatedAt: now() }).
  If dropping to a "Lost" stage, open a modal asking for lostReason (required).
  If dropping to "Won" stage, set actualCloseDate to today.
- Click on a deal card → open deal detail modal (see below)
- "New Deal" and inline "Add Deal" → open deal create modal
- Pipeline selector change → re-render with selected pipeline

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIST VIEW TOGGLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

List view shows a sortable table: title, client, stage, value, probability,
close date, lead score, owner, actions (edit, delete).
Persist view mode preference in localStorage key 'taskapp_pipeline_view_v1'.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEAL DETAIL / EDIT MODAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Full-screen slide-over modal (consistent with other record modals in this codebase).
Sections:

1. Header — title (editable inline), stage badge, value, probability
2. Details — client (searchable select), contact, owner, close date, currency, tags
3. Custom Fields — rendered by renderCustomFields('deal', record, 'edit') from Prompt 1
4. Notes — textarea (markdown-lite: bold, italic, lists)
5. Linked Items — link/unlink Projects and Tasks
6. Communications — list of communication records linked to this deal's clientId
   (read-only; link to full communications view filtered by this client)
7. Activity Log — chronological list of changes to this deal record
   (derive from audit log filtered by entityType:'deal' entityId:deal.id)
8. Lead Score — display score gauge + score breakdown (from Prompt 5)

On save: call dbUpdate('deals', id, changes). Write audit event.
On delete: call softDelete('deals', id).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PIPELINE SETTINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a "Pipelines" section in the Settings view:

- Create new pipeline (name + choose preset or start blank)
- Edit stages (add, rename, reorder, set color, set probability, mark as won/lost)
- Set default pipeline
- Delete pipeline (only if no deals are in it, or confirm bulk-move deals first)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCESSIBILITY (WCAG 2.2 AA)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Kanban columns must be keyboard-navigable: Tab to card, Space to pick up,
  Arrow keys to move between columns, Enter to drop.
- All drag-and-drop actions must be achievable via keyboard alone.
- Color is never the only indicator (stage names always visible, not just column color).
- Minimum 4.5:1 contrast ratio on all text.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECURITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- All user content through escH() before innerHTML.
- Client name, deal title: never trust raw state — always escH().
- Lost reason is user input: sanitize with sanitize.ts before storing.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Pipeline view renders in sidebar and is navigable
□ Deals can be drag-dropped between columns
□ Lost-stage drop prompts for lostReason
□ Won-stage drop sets actualCloseDate
□ List/Kanban toggle persists across reloads
□ Deal detail modal opens, edits persist
□ Keyboard-only drag-drop works (Tab + Arrow + Enter)
PROMPT 4 — Sales Forecasting Dashboard

You are implementing the Sales Forecasting view in the Task App CRM monorepo
(d:\techkeycrmapp). Depends on PROMPT 2 (Deals schema) and PROMPT 3 (Pipeline view).

Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORECAST ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/forecast.ts

ForecastResult:
periodLabel: string (e.g. "May 2026", "Q2 2026")
expectedRevenue: number (Σ value × probability for all open deals closing in period)
committedRevenue: number (Σ value × probability for deals in stages with probability ≥ 80%)
pipelineValue: number (Σ value of all open deals regardless of probability)
wonRevenue: number (Σ value of won deals closed in period)
dealCount: number
avgDealValue: number
avgSalesCycle: number (days from createdAt to actualCloseDate, won deals only)
conversionRate: number (won / (won + lost) in period, %)
stageBreakdown: { stageId, stageLabel, count, totalValue, weightedValue }[]
atRisk: Deal[] (open deals where closeDate < 14 days and probability < 80%)
stale: Deal[] (open deals with no communication in 30+ days)

calculateForecast(deals: Deal[], pipelines: DealPipeline[], period: 'month'|'quarter'|'year',
referenceDate?: Date): ForecastResult

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORECAST VIEW (added as 3rd toggle in Pipeline view)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to packages/core/src/views/pipeline.ts — renderForecastTab() and bindForecastTab().

UI layout:
Top row: period selector (This Month | This Quarter | This Year | Custom Range)

KPI cards (4 across):
Expected Revenue — Σ weighted
Committed Revenue — high-probability weighted
Pipeline Value — total open
Won This Period — actual closed-won

Stage funnel: horizontal bar chart (pure CSS/SVG — no external chart library).
Each stage: label, deal count, total value, width proportional to deal count.

"At Risk" section: deals closing in <14 days with probability <80%.
Each row: deal title, client, close date, value, days remaining. Link to deal modal.

"Stale Deals" section: open deals with no communication log in 30+ days.
Each row: deal title, client, last communication date, value.
"Create Follow-up" button per row — opens task create modal pre-filled with deal context.

Won/Lost ratio: simple donut chart (CSS conic-gradient, no library).

Month-over-month trend: sparkline (SVG polyline) of expectedRevenue for last 6 periods.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI FORECAST INSIGHTS (offline-safe)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If AI is available (aiRuntime.ready === true and aiRuntime.backend !== null):
Show "AI Insights" card below KPIs.
Send forecast data summary (no PII — only aggregates and patterns) to the AI.
Prompt: "You are a revenue analyst. Here is this period's pipeline data: [summary].
Identify 2-3 specific risks, 1-2 opportunities, and the single most impactful
action the sales team should take this week. Be concise and specific."
Stream response into the card. Show spinner while loading.
Cache last AI insight in localStorage key 'taskapp_forecast_ai_insight_v1'
with a 4-hour TTL so it doesn't re-query on every navigation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECURITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Never send deal titles or client names to AI — only aggregated numeric data.
- All rendered strings through escH().
- AI insight is cached in localStorage (plaintext) — ensure it contains no PII.

ACCEPTANCE CRITERIA:
□ Forecast tab renders in Pipeline view
□ KPI cards show correct calculated values
□ At Risk and Stale Deals sections populate correctly
□ "Create Follow-up" from Stale Deals opens pre-filled task modal
□ AI Insights card appears when AI is ready; shows cached insight on revisit
□ pnpm run typecheck passes; pnpm run build:offline succeeds
PROMPT 5 — Lead Scoring Engine

You are implementing the Lead Scoring Engine in the Task App CRM monorepo
(d:\techkeycrmapp). Depends on PROMPT 1 (vertical profiles) and PROMPT 2 (deals).

Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORING MODEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/lead-scoring.ts

LeadScoringWeights (from vertical profile, Prompt 1):
recentCommunication: number (default 25) — days since last communication, inverted
communicationFrequency: number (default 20) — communications in last 90 days
openTaskCount: number (default 10) — open tasks linked to deal/client
dealValue: number (default 20) — normalized against max deal value in pipeline
stageProgress: number (default 15) — how far along in pipeline (stage probability)
profileCompleteness: number (default 10) — % of required fields filled on client/contact

ScoreBreakdown:
totalScore: number (0–100)
grade: 'A' | 'B' | 'C' | 'D' | 'F'
factors: { label: string; score: number; maxScore: number; explanation: string }[]
computedAt: string (ISO timestamp)
trend: 'improving' | 'stable' | 'declining' (compare to previous score if stored)

calculateLeadScore(deal: Deal, state: AppState, weights: LeadScoringWeights): ScoreBreakdown

scoringEngine:
scoreAllDeals(state: AppState): void
— iterates open deals, calculates score, calls dbUpdate('deals', id, { leadScore })
— runs in a requestIdleCallback so it does not block UI
— debounced: only runs if data has changed since last run

Export:
calculateLeadScore
scoringEngine
getScoreGrade(score: number): 'A'|'B'|'C'|'D'|'F'
getScoreBadgeHtml(score: number): string (returns safe HTML badge string, no escH needed here
because it only contains calculated numbers and hardcoded strings — document this)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORE BADGE COMPONENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to packages/core/src/ui/components.ts:
renderScoreBadge(score: number | undefined): string
— renders a circular badge: A (green), B (blue), C (yellow), D (orange), F (red)
— if score undefined: renders a grey "—" badge

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTEGRATION POINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Call scoringEngine.scoreAllDeals(state) after every successful vault load in main.ts
  (after reloadData(), wrapped in requestIdleCallback).
- Call calculateLeadScore and update deal record when:
  a communication is created/updated for this deal's clientId
  a task linked to this deal changes status
  the deal itself is updated
- Score badge appears on deal cards in the Pipeline Kanban (Prompt 3).
- Score breakdown panel appears in the Deal detail modal (Prompt 3).
- Score badge appears on client list rows.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WEIGHT CUSTOMIZATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a "Lead Scoring" section in Settings:

- Sliders for each weight factor (must sum to 100; show live sum; warn if ≠ 100)
- "Reset to vertical defaults" button
- "Rescore all deals" button (triggers immediate scoreAllDeals run)
  Persist weights in localStorage key 'taskapp_scoring_weights_v1'.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EU AI ACT COMPLIANCE (Article 13 — Transparency)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lead scoring is an automated decision-support system. Per EU AI Act 2026:

- Show a (ℹ) info icon next to every score badge.
- Clicking it opens a transparency panel explaining: what the score means,
  what factors were used, that it is advisory only, and that no automated
  decisions are made without human review.
- The transparency explanation must use getTerm() for entity terminology.
- Log a 'lead_score_computed' audit event (entityType:'deal', entityId, score, factors).

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Score badge appears on deal cards in Pipeline Kanban
□ Score updates within 1 requestIdleCallback cycle after a communication is added
□ Score breakdown panel shows per-factor detail in deal modal
□ EU AI Act transparency panel opens on (ℹ) click
□ 'lead_score_computed' audit event written on each score computation
□ Weight sliders persist and affect scoring immediately on "Rescore all"
PROMPT 6 — Workflow Automation Rule Engine

You are implementing the Workflow Automation Rule Engine in the Task App CRM monorepo
(d:\techkeycrmapp). Depends on PROMPT 1 (custom fields), PROMPT 2 (deals).

Read CLAUDE.md fully before starting. This engine must work fully offline (client-side).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULE SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/schemas/automation.schema.ts

TriggerType: 'record_created' | 'record_updated' | 'record_deleted' |
'field_changed' | 'stage_changed' | 'time_elapsed' |
'communication_logged' | 'task_completed' | 'deal_won' | 'deal_lost'

ConditionOperator: 'equals' | 'not_equals' | 'contains' | 'not_contains' |
'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty' |
'days_since_gte' | 'days_since_lte'

ActionType: 'create_task' | 'create_notification' | 'update_field' |
'send_email_log' | 'move_deal_stage' | 'assign_tag' | 'remove_tag' |
'ai_summarize' | 'webhook_call'

AutomationRuleSchema (Zod):
id: string
name: string
description?: string
isActive: boolean
entityType: 'deal' | 'client' | 'task' | 'project' | 'person' | 'communication'
trigger: { type: TriggerType; fieldKey?: string }
conditions: {
id: string
fieldKey: string
operator: ConditionOperator
value: unknown
logicGate: 'AND' | 'OR'
}[]
actions: {
id: string
type: ActionType
params: Record<string, unknown> (type-specific payload)
delayMinutes?: number (0 = immediate)
requiresHumanApproval: boolean
}[]
runCount: number
lastRunAt?: string
createdAt: string
updatedAt: string
aiGenerated: boolean (true if AI suggested this rule)
euAiActScope: 'operational' | 'decision-support' (always 'operational' for field updates;
'decision-support' for move_deal_stage, assign_owner — requires human approval)

Store rules in IDB as a special record '**automation_rules**' in the documents store.
(Add 'automationRules' to IDB_STORES in constants.ts.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULE ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/automation/rule-engine.ts

rulesEngine:
evaluate(trigger: TriggerType, entityType: string, record: unknown, prev?: unknown): void
— loads active rules, filters by trigger + entityType
— for each matching rule: evaluates all conditions (AND/OR logic)
— if conditions pass: schedules actions
— if action.requiresHumanApproval: creates a pending notification for user to approve
— if action.delayMinutes > 0: stores pending action in '**automation_pending**' IDB record
and sets a setTimeout (or, if PWA/enterprise: a Service Worker alarm)

executeAction(rule: AutomationRule, action: RuleAction, record: unknown): Promise<void>
— create_task: calls dbCreate('tasks', { title: params.title, ... })
— create_notification: calls dbCreate('notifications', ...)
— update_field: calls dbUpdate(entityType, record.id, { [params.field]: params.value })
— move_deal_stage: calls dbUpdate('deals', record.id, { stageId: params.stageId })
— assign_tag / remove_tag: updates tags array
— ai_summarize: calls the AI backend with record content; stores summary in record.notes
— webhook_call: only in enterprise/pwa builds (check deployment policy; no-op in offline)
— After each execution: updates rule.runCount, rule.lastRunAt; writes audit event.

processPendingActions(): void
— called on app load; processes any delayed actions whose time has come.

Integrate evaluate() into dbCreate, dbUpdate, dbDelete in storage/db.ts:
After each successful write, call rulesEngine.evaluate(triggerType, store, newRecord, prevRecord).
This must be fire-and-forget (no await in the DB write path) to avoid blocking flushes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISUAL RULE BUILDER UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/views/automations.ts

Add 'automations' to valid currentView values.
Add to sidebar nav.

renderAutomations(state: AppState): string

- List of all rules: name, entity type, trigger, active toggle, run count, last run.
- "New Rule" button.
- "AI Suggest Rules" button (see AI Suggestions below).

Rule builder (rendered in a full modal):
Step 1 — "When this happens": pick entity type, then trigger type.
If trigger = 'field_changed', pick which field.
If trigger = 'time_elapsed', pick the field to measure from (e.g. last communication)
and the threshold (e.g. 30 days).
Step 2 — "And these conditions are true" (optional):
Add condition rows: field selector → operator → value input.
Logic gate toggle (AND / OR) between rows.
Step 3 — "Do this":
Add action rows: action type selector → type-specific param form.
Toggle: Immediate vs Delayed (minutes input).
Toggle: Requires human approval (required if euAiActScope = 'decision-support').
Step 4 — Name and description. Preview: "When a deal is created AND value > $10,000,
create a task 'Executive review' assigned to owner."
Save button → validates, saves to IDB, reloads rules.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI RULE SUGGESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"AI Suggest Rules" button (visible only if aiRuntime.ready === true):

1. Collect anonymized pattern data from last 90 days:
   - What % of deals stall at each stage and for how long
   - What % of clients have had no communication in 30+ days
   - Most common task types created after deal stage changes
   - Lead-to-close conversion rates
2. Send ONLY aggregated/statistical data (no names, no values, no content) to AI.
3. Prompt: "You are a CRM automation consultant. Based on these pipeline patterns: [stats].
   Suggest 3 workflow automation rules in JSON format matching this schema: [schema].
   Each rule should address a specific inefficiency you observe in the data.
   Return valid JSON only, no prose."
4. Parse AI response, validate against AutomationRuleSchema.
5. Show each suggested rule as a card: "AI suggests: When a deal has been in Proposal
   stage for >7 days with no communication, create a follow-up task."
   Each card has: "Add this rule" (saves as aiGenerated:true, inactive by default)
   and "Dismiss" buttons.
6. Added AI rules show an "AI Generated" badge. User must manually activate them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EU AI ACT COMPLIANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Actions with euAiActScope='decision-support' must have requiresHumanApproval:true enforced.
  The builder must make this mandatory (disable the toggle, show explanation).
- AI-generated rules are never activated automatically — user must review and enable.
- Every rule execution writes a 'automation_rule_fired' audit event including ruleId,
  ruleName, triggeredBy, entityId, actions taken.
- Pending approval notifications must show: what action is proposed, which rule triggered it,
  and allow Approve / Dismiss.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Automations view renders in sidebar
□ Rule builder creates and saves a rule
□ Rule fires on the correct trigger (e.g., create a deal → rule creates a task)
□ Delayed actions are queued and processed on next app load
□ Decision-support actions create a pending-approval notification, not auto-execute
□ AI Suggest Rules returns parseable JSON rules and renders suggestion cards
□ Every rule execution writes an audit event
PROMPT 7 — Agentic AI Integration

You are implementing the Agentic AI Agent Loop in the Task App CRM monorepo
(d:\techkeycrmapp). This depends on PROMPT 5 (lead scoring), PROMPT 6 (automation).

Read CLAUDE.md fully. The offline-web build uses only browser built-in AI
(Gemini Nano / Phi-4-mini via window.LanguageModel). Agentic features must
degrade gracefully when AI is unavailable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGENT LOOP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/ai/ai-agent.ts

agentLoop:
isRunning: boolean
lastRunAt: string | null
pendingInsights: AgentInsight[]

AgentInsight:
id: string
type: 'stale_deal' | 'duplicate_contact' | 'follow_up_needed' | 'document_summary' |
'anomaly_detected' | 'rule_suggestion' | 'forecast_risk'
title: string
body: string
severity: 'info' | 'warning' | 'action_required'
entityType: string
entityId: string
suggestedAction?: { label: string; handler: string; params: Record<string, unknown> }
aiGenerated: true
createdAt: string
dismissed: boolean
accepted: boolean

runAgentCycle(state: AppState): Promise<void>
— called via requestIdleCallback every 15 minutes after initial app load
— runs only if aiRuntime.ready === true and aiRuntime.backend !== null
— executes these checks in sequence (abort if browser becomes busy):

CHECK 1 — Stale Deals (no AI needed; pure data logic)
Open deals with no communication in last 30 days → create AgentInsight type 'stale_deal'
Action: "Create follow-up task"

CHECK 2 — Follow-up Needed (no AI needed)
Tasks with dueDate < today AND status !== 'done' → type 'follow_up_needed'
Action: "Snooze 3 days" or "Mark complete"

CHECK 3 — Duplicate Contacts (AI-assisted; see Prompt 8)
Delegate to duplicateDetector.findDuplicates(state)
Each duplicate pair → type 'duplicate_contact'
Action: "Review and merge"

CHECK 4 — Document Summaries (AI required)
Documents created/updated in last 24h that have no 'aiSummary' field yet.
For each: send first 2000 chars (no PII if HIPAA flag set — strip before sending)
to AI with prompt: "Summarize this document in 2-3 sentences. Return plain text only."
Store summary in document record as aiSummary field.
Emit type 'document_summary' insight.

CHECK 5 — Forecast Risk (AI-assisted)
Pass current ForecastResult (numeric only, no PII) to AI.
Prompt: "Identify the single biggest risk to this period's revenue forecast in one sentence."
Emit type 'forecast_risk' if AI response is substantive.

After all checks: update agentLoop.lastRunAt, store pendingInsights in
localStorage 'taskapp_agent_insights_v1'.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI INSIGHTS PANEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add an "AI Insights" panel to the dashboard (views/dashboard.ts).

- Shows up to 5 most recent non-dismissed AgentInsights.
- Each insight card: icon (severity), title, body, entity link, suggested action button,
  "Dismiss" (X) button.
- Accepting a suggested action calls the relevant handler (e.g. dbCreate('tasks', ...)).
- "View all insights" link opens a dedicated insights list (rendered as a sub-section
  of the AI view, currentView:'ai').

Add a badge to the sidebar AI nav item showing count of action_required insights.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROACTIVE NOTIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For severity:'action_required' insights: also create a notification record via
dbCreate('notifications', { title: insight.title, body: insight.body, type: 'ai_agent',
linkedEntityType: insight.entityType, linkedEntityId: insight.entityId })
so it appears in the notifications panel.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EU AI ACT COMPLIANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Every AgentInsight must display "AI-generated" label.
- Suggested actions require explicit user click (never auto-execute).
- Document summaries: show a disclaimer "This summary was generated by on-device AI
  and may contain inaccuracies. Review the original document before acting."
- HIPAA builds: never send document content to AI if hipaa compliance flag is active
  AND the document contains any HIPAA-classified custom field values.
  Instead, skip and emit insight: "Document contains PHI — manual review required."
- Write 'ai_agent_cycle_run' audit event after every cycle with: timestamp, checks run,
  insights generated, AI calls made (count only, no content).

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Agent cycle runs after 15 minutes of app being open (testable by reducing timer)
□ Stale deal insight appears correctly for a deal with no recent communication
□ Document summary is written to document record aiSummary field
□ AI insights panel renders on dashboard
□ Dismissing an insight removes it from panel and marks dismissed:true in storage
□ action_required insights appear in notifications panel
□ HIPAA flag skips PHI document content, emits manual-review insight
PROMPT 8 — Duplicate Detection

You are implementing Duplicate Detection in the Task App CRM monorepo (d:\techkeycrmapp).
Depends on PROMPT 7 (agent loop calls this).

Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DUPLICATE DETECTOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/duplicate-detector.ts

DuplicateCandidate:
entityType: 'client' | 'person'
recordA: { id: string; label: string }
recordB: { id: string; label: string }
matchScore: number (0-100)
matchReasons: string[] (e.g. "Same email", "Similar name (92%)")
status: 'pending' | 'merged' | 'dismissed'

duplicateDetector:

findDuplicates(state: AppState): DuplicateCandidate[]
— Clients: compare name (Jaro-Winkler similarity ≥ 85%), email exact match,
phone normalized match (strip non-digits, compare last 10).
— People: compare (firstName+lastName) Jaro-Winkler ≥ 85%, email exact, phone exact.
— Implement Jaro-Winkler in-file (pure function, no external library — it is ~30 lines).
— Run in a Web Worker if available (postMessage pattern) so it doesn't block UI on
large datasets. Fall back to synchronous execution if Web Worker is unavailable.
— Skip pairs already marked 'merged' or 'dismissed'.
— Return candidates sorted by matchScore desc.

mergeRecords(entityType: 'client'|'person', keepId: string, mergeId: string,
state: AppState): Promise<void>
— Gather all records referencing mergeId (tasks, projects, deals, communications,
files, timeEntries) and update their FK to keepId.
— Merge tags arrays (union).
— Merge customFields (keepId values win on conflict).
— softDelete(entityType, mergeId) — never hard-delete during merge.
— Write audit event: 'record_merged', entityType, keepId, mergeId, fieldsMerged.

dismissPair(candidateId: string): void
— Stores dismissed pairs in localStorage 'taskapp_dismissed_dupes_v1' as set of
sorted ID pairs so they are never surfaced again.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MERGE UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a "Duplicates" section to the Settings view.
Show each DuplicateCandidate as a side-by-side comparison card:
Left: Record A fields. Right: Record B fields.
Match reasons listed below.
Per-field selector: "Keep A" / "Keep B" / "Merge (combine)" for conflicting fields.
"Merge" button (calls mergeRecords with keepId = whichever user selected as primary).
"Not a duplicate" button (calls dismissPair).

Also surface duplicates as AgentInsights via the agent loop (Prompt 7).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ON-CREATE DUPLICATE CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When user saves a new client or person record:
Run findDuplicates synchronously against the new record vs existing records only.
If matchScore ≥ 90%: show a warning banner above the save button:
"⚠ Possible duplicate: [Name] already exists ([match reasons]).
[View existing] [Save anyway]"
If matchScore 75-89%: show a softer info notice.
If matchScore < 75%: no warning.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Two clients with the same name score ≥ 85 and appear as a candidate
□ Merge updates all FK references in tasks/projects/deals to keepId
□ Merged record is soft-deleted, not hard-deleted
□ Dismissed pairs never re-surface
□ On-create warning appears for near-exact name match
□ Audit event written on merge
PROMPT 9 — Voice Input

You are implementing Voice Input via the Web Speech API in the Task App CRM monorepo
(d:\techkeycrmapp). This works in all builds (offline-web, pwa-sync, mobile, enterprise).

Read CLAUDE.md fully before starting. Use the Web Speech API (browser-native,
no server, no external API). Degrade gracefully in browsers without support.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE SERVICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/voice-input.ts

voiceInput:
isSupported: boolean (typeof SpeechRecognition !== 'undefined' || typeof webkitSpeechRecognition !== 'undefined')
isListening: boolean
transcript: string
confidence: number
lastError: string | null

startListening(onResult: (transcript: string, isFinal: boolean) => void,
onError: (error: string) => void): void
— Sets continuous: false, interimResults: true, lang: from browser navigator.language
— Calls onResult with interim results (isFinal: false) for live preview
— Calls onResult with final result (isFinal: true) and stops
— Auto-stops after 30 seconds of no input (sets timeout)
— Cleans up recognition instance on stop

stopListening(): void

dictateToField(inputElement: HTMLInputElement | HTMLTextAreaElement,
onComplete?: () => void): void
— Appends transcript to field value (does not replace existing text)
— Shows interim text in a floating preview bubble above the field

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE BUTTON COMPONENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to packages/core/src/ui/components.ts:
renderVoiceButton(fieldId: string): string
— Returns an HTML button with a microphone icon (from icons.ts)
— If voiceInput.isSupported: active button with aria-label "Start voice input"
— If not supported: hidden (display:none) — do not show broken buttons

Add to bindVoiceButtons(): void (called in main.ts after every render):
Attaches click handlers to all [data-voice-field] buttons.
On click: calls voiceInput.dictateToField(targetInput).
Animates button during listening (pulsing red ring via CSS class).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTEGRATION POINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add voice buttons to these fields (add data-voice-field="<fieldId>" to the input,
and renderVoiceButton('<fieldId>') next to it):

- Task title, task notes
- Deal title, deal notes
- Communication notes (the main body field in the log communication modal)
- Standalone notes content
- AI chat input (ai-ui.ts) — already has its own input; add voice to it

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE COMMAND SHORTCUTS (AI-powered)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If AI is ready and the voice input is triggered from the command palette (not a form field):
After final transcript received, send to AI chat as a command:
"The user said: '[transcript]'. Interpret this as a CRM command and execute it using
the available tools." (Routes through existing ai-tools.ts tool catalog.)
Show the transcript in the AI chat input first, then auto-submit.
Example: "Add a task to review the Smith proposal by Friday" →
AI uses create_task tool with parsed title, dueDate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Web Speech API: audio is processed by the browser, not sent to any app server.
  In Chrome: speech is processed by Google servers unless on-device recognition is
  enabled. Show a one-time notice: "Voice input uses your browser's built-in speech
  recognition. In Chrome, audio may be processed by Google. Use the offline AI chat
  for fully private voice commands." (Store acknowledgment in localStorage.)
- HIPAA builds: disable voice input for any field tagged as PHI (hipaaClassified:true).
  Replace voice button with a lock icon tooltip: "Voice input disabled for PHI fields."

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Voice button appears next to task title field
□ Speaking populates the field with transcript
□ Browser without SpeechRecognition: voice button is hidden, no errors thrown
□ Privacy notice shown on first use
□ Voice command via command palette sends transcript to AI chat and executes
□ HIPAA build: PHI fields show lock icon instead of voice button
PROMPT 10 — CSV Bulk Import

You are implementing CSV Bulk Import in the Task App CRM monorepo (d:\techkeycrmapp).
Works in all builds. All processing is client-side — no server upload.

Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORT ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/import-export.ts (extend existing if file exists)

parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] }
— Handles: quoted fields, commas inside quotes, line breaks inside quotes,
Windows CRLF and Unix LF, UTF-8 BOM.
— Pure function, no external library.

ImportMapping:
csvColumn: string
targetField: string (entity field name or custom field key)
transform?: 'none' | 'date_iso' | 'boolean' | 'tag_split' | 'currency_number'

ImportPreview:
entityType: string
totalRows: number
mappings: ImportMapping[]
sampleRows: Record<string, unknown>[] (first 5 rows with mappings applied)
validationErrors: { row: number; field: string; error: string }[]
duplicates: { row: number; matchedId: string; matchScore: number }[]

ImportResult:
created: number
updated: number (if user chose to update existing on duplicate)
skipped: number (duplicates user chose to skip)
errors: { row: number; error: string }[]

importRecords(entityType: string, rows: Record<string,unknown>[], mapping: ImportMapping[],
onDuplicate: 'skip'|'update'|'create_new', state: AppState): Promise<ImportResult>
— Validates each row against the entity's Zod schema.
— Checks for duplicates using duplicateDetector (Prompt 8).
— Creates/updates records via dbCreate/dbUpdate.
— Processes in chunks of 50 with a 10ms yield between chunks (prevents UI freeze).
— Writes one 'bulk_import' audit event with counts (not row-level data).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORT UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add an "Import" option to the toolbar/menu of: Clients, People, Deals, Tasks, Projects.
Opens a multi-step modal:

Step 1 — Upload
Drag-and-drop zone or file input (accept: .csv).
Max size: 10MB. Show file name and row count on parse.
Parse immediately client-side.

Step 2 — Entity Type + Field Mapping
If triggered from a specific entity view: entity is pre-selected.
Otherwise: dropdown to pick entity type.
Auto-map: if a CSV header closely matches a known field name (case-insensitive,
strip spaces/underscores), pre-fill the mapping.
If AI is ready: "AI Map Fields" button — send headers and first 3 rows (no PII,
just structure) to AI: "Map these CSV columns to CRM fields. CSV headers: [x,y,z].
Known CRM fields: [a,b,c]. Return JSON: {csvColumn, targetField}[]."
Show mapping table: CSV column | Sample data | → | CRM field (select) | Transform (select).

Step 3 — Preview + Validation
Show first 5 rows with mappings applied.
Show validation errors (red rows).
Show duplicate warnings (yellow rows) with option: Skip | Update | Create New.
Summary counts: X will be created, Y will be updated, Z have errors.

Step 4 — Import
Progress bar (updated every chunk).
On complete: show ImportResult summary.
"View imported records" link filters the entity list to newly created records.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPORT (extend existing)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ensure every entity list has an "Export CSV" button.
Export includes custom fields (Prompt 1). PHI fields (hipaaClassified:true) are
replaced with "[REDACTED]" in exports unless user has explicitly confirmed export of PHI data
(shown in a confirmation modal with a HIPAA warning).

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ CSV with 100 clients imports correctly with no UI freeze
□ Auto-mapping detects "Client Name" → name field
□ AI field mapping button returns parseable JSON
□ Duplicates are detected and user choice (skip/update/new) is respected
□ Audit event written on import with count summary
□ PHI field redaction on export, with confirmation modal
□ Progress bar updates during large import
PROMPT 11 — Omnichannel Communications Log

You are extending the Communications entity to support omnichannel logging in the
Task App CRM monorepo (d:\techkeycrmapp).

Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXTENDED COMMUNICATION SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Update packages/core/src/schemas/communication.schema.ts
Add/expand the 'type' field to include all channels:
'email' | 'phone_call' | 'video_call' | 'sms' | 'whatsapp' | 'linkedin' |
'twitter_x' | 'in_person' | 'letter' | 'note' | 'ai_summary' | 'webhook'

Add fields to CommunicationSchema:
channel: CommunicationChannel (same as type, for clarity — keep both)
direction: 'inbound' | 'outbound' | 'both'
duration?: number (minutes; for call/video types)
outcome?: string (e.g. "Left voicemail", "Scheduled demo", "No answer")
sentiment?: 'positive' | 'neutral' | 'negative' (AI-computed, see below)
linkedDealId?: string (link communication to a specific deal)
linkedProjectId?: string
attachmentIds?: string[] (fk → files store)
aiSummary?: string (AI-generated summary, stored encrypted in record)
emailSubject?: string (for email type)
emailFrom?: string (for email type)
emailTo?: string[] (for email type)
externalId?: string (for webhook/sync-sourced records; dedup key)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMUNICATION LOG UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Update packages/core/src/views/ communications view.

Filters: by type/channel, by direction, by linked client/deal/project, date range.

New Communication modal:
Channel picker (icon grid: Email, Phone, Video, SMS, WhatsApp, LinkedIn, In-Person, Note...)
Direction toggle (Inbound / Outbound / Both)
Date + time picker (default: now)
Duration (show only for call/video types)
Outcome dropdown + free-text
Subject (show only for email type)
From / To fields (show only for email type; see Prompt 12)
Notes / body (textarea with voice input button from Prompt 9)
Link to: Deal, Project (searchable selects)
Attachment: link existing files from the files store
"AI Analyze" button (if AI ready): analyzes notes, returns sentiment + suggested outcome + summary.

Timeline view: group communications by date, show channel icon, direction arrow,
outcome pill, sentiment badge (colored dot), duration if present.
On click: expand to show full notes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI SENTIMENT + SUMMARY ON SAVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If AI is ready and the communication has ≥ 50 chars of notes:
Auto-analyze on save (fire-and-forget via requestIdleCallback):
Prompt: "Analyze this sales communication note. Return JSON: { sentiment: 'positive'|'neutral'|'negative',
summary: string (1 sentence), suggestedOutcome: string|null }. Note: [content]"
Store results back to communication record.
Show sentiment badge in timeline immediately after analysis completes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOLLOW-UP REMINDERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After logging a communication, prompt: "Create a follow-up reminder?"
If yes: show a task-create mini-form (title prefilled as "Follow up with [clientName]",
dueDate defaulting to +3 business days, linked to same client/deal).
This integrates with the automation rule engine (Prompt 6): if a rule exists for
'communication_logged' trigger, the rule fires instead of / in addition to this manual prompt.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ All channel types render correct icon in timeline
□ Email type shows From/To/Subject fields
□ AI sentiment badge appears on communications after save
□ Follow-up task prompt appears and creates linked task
□ Communications can be linked to a Deal and appear in deal detail modal (Prompt 3)
PROMPT 12 — Email Integration: Offline AI-Assisted Logging

You are implementing AI-assisted email logging for the offline builds in the Task App CRM
monorepo (d:\techkeycrmapp). This works fully offline — no OAuth, no server.

Read CLAUDE.md fully. This feature is available in offline-web (all sub-profiles),
mobile, and pwa-sync builds. Enterprise-web uses OAuth2 sync (Prompt 13).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMAIL PASTE / IMPORT MODAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add "Log Email" button to the Communications view and to each client/deal detail.
Opens a modal with two input methods:

METHOD 1 — Paste raw email text
Large textarea: "Paste the full email text here (header + body)"
If AI is ready: "Parse with AI" button (auto-fires after 2s of inactivity if AI ready).
If AI not ready: parse headers client-side with regex (From:, To:, Subject:, Date:).

METHOD 2 — Manual structured entry
Falls back to standard communication log modal from Prompt 11 with type:'email'.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI EMAIL PARSER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When "Parse with AI" fires:

1. Send email text to AI. Prompt:
   "Parse this email and extract: { from: string, to: string[], subject: string,
   date: string (ISO 8601), bodyText: string (strip quoted replies),
   sentiment: 'positive'|'neutral'|'negative',
   summary: string (1 sentence max),
   suggestedOutcome: string|null,
   contactName: string|null,
   contactEmail: string|null,
   contactCompany: string|null }.
   Return valid JSON only. Email: [text]"
2. Validate response against a Zod schema.
3. Pre-fill the communication form:
   emailFrom, emailTo, emailSubject, direction (infer from position in To vs From)
   date from parsed date, notes = bodyText, aiSummary = summary, sentiment.
4. Attempt to auto-match contactEmail to existing person/client records.
   If matched: auto-link the communication to that client.
   If not matched: show "Create contact?" prompt with pre-filled name/email/company.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMAIL HEADER REGEX PARSER (fallback)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implement parseEmailHeaders(rawText: string): Partial<ParsedEmail>
Extracts From, To, Cc, Subject, Date using RFC 5322-aware regex.
Does NOT extract body sentiment (requires AI).
Used when AI is unavailable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Email content is sent to the browser's on-device AI (Gemini Nano / Phi-4-mini).
  Per CLAUDE.md: allowedTiers: ['browser'] in offline build. No cloud AI call is made.
- Show one-time notice: "Email content is processed by your device's built-in AI.
  It does not leave your device."
- HIPAA builds: add warning "Ensure this email contains no PHI before parsing."
  User must check a checkbox to confirm before parsing proceeds.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Pasting a raw email and clicking Parse fills the form correctly
□ contactEmail match auto-links to existing client
□ "Create contact?" prompt appears for unmatched email
□ Regex fallback parses From/To/Subject when AI unavailable
□ HIPAA confirmation checkbox blocks parsing until confirmed
PROMPT 13 — Email Integration: Server/PWA OAuth2 Two-Way Sync

You are implementing OAuth2 email sync for the enterprise-web and pwa-sync builds
in the Task App CRM monorepo (d:\techkeycrmapp).
This is server-side only. Offline builds use AI-assisted logging (Prompt 12).

Read CLAUDE.md fully. This builds on the existing Hono v4 server in server/src/.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVER: EMAIL OAUTH2 SERVICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: server/src/services/email-sync.ts

Support two providers:
A. Microsoft (Outlook/Exchange) — Microsoft Graph API
Scopes: Mail.Read, Mail.ReadWrite, offline_access
Token endpoint: https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
Mailbox endpoint: https://graph.microsoft.com/v1.0/me/messages

B. Google (Gmail) — Gmail API
Scopes: https://www.googleapis.com/auth/gmail.readonly, offline_access
Token endpoint: https://oauth2.googleapis.com/token
Mailbox endpoint: https://gmail.googleapis.com/gmail/v1/users/me/messages

EmailSyncConfig (Drizzle table: email_sync_configs):
id, userId, tenantId, provider: 'microsoft'|'google',
accessToken (AES-256-GCM encrypted at rest in DB), refreshToken (encrypted),
tokenExpiresAt, syncFromDate, lastSyncAt, syncEnabled, foldersToSync: string[]

EmailSyncService:
initiateOAuth(provider, userId, tenantId, redirectUri): string (returns auth URL)
handleOAuthCallback(provider, code, state, userId, tenantId): Promise<void>
(exchanges code for tokens; stores encrypted in DB)
syncEmails(userId, tenantId): Promise<{ created: number; skipped: number }>
— Fetches emails from configured provider using stored token (refresh if expired)
— For each email:
Check externalId in communications table — skip if already synced
Parse From/To/Subject/Date/Body (HTML → plain text strip)
Match From or To email against people/clients in DB (by tenant)
Create communication record: type:'email', externalId set, linked to matched client
Body stored encrypted via normal communication storage path
— Return sync counts
revokeOAuth(userId, tenantId): Promise<void>
— Calls provider revocation endpoint, deletes stored tokens

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVER: EMAIL SYNC ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: server/src/api/routes/email-sync.ts
Mount at /api/v1/email-sync in server/src/index.ts

POST /api/v1/email-sync/connect — initiates OAuth (returns auth URL)
GET /api/v1/email-sync/callback — OAuth callback handler
POST /api/v1/email-sync/sync — triggers manual sync
DELETE /api/v1/email-sync/disconnect — revokes + deletes tokens
GET /api/v1/email-sync/status — returns last sync time, count, enabled status

All routes: authMiddleware (userId/tenantId from JWT).
All routes: opaMiddleware('email_sync') — add to crm.rego policy.
Zod validation on all request bodies.
Never log token values. Never return token values in API responses.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVER: BACKGROUND SYNC SCHEDULER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: server/src/email-sync/sync-scheduler.ts
Polls every 5 minutes (setInterval): for each user with syncEnabled:true,
calls EmailSyncService.syncEmails(userId, tenantId).
Errors are caught and logged (never crash the process).
Integrate into graceful shutdown: stop scheduler on SIGTERM before pool close.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UI: EMAIL SYNC SETTINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In the Settings view (only rendered in enterprise/pwa builds — check deployment policy
or a build flag; in offline builds this section is hidden):
"Email Integration" section:

- Status: Connected / Not Connected (show provider name and last sync time)
- "Connect Microsoft Outlook" button → redirects to OAuth flow
- "Connect Gmail" button → redirects to OAuth flow
- "Sync Now" button → POST /api/v1/email-sync/sync and show result count
- "Disconnect" button → DELETE /api/v1/email-sync/disconnect + confirmation dialog
- Folders to sync (multi-select: Inbox, Sent, etc.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECURITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- OAuth tokens encrypted at rest using AES-256-GCM in the DB before insert.
- Token values never appear in server logs, API responses, or error messages.
- Refresh token rotation: on each token refresh, old refresh token is replaced.
- OAuth state parameter must be cryptographically random (16 bytes, hex) and validated
  on callback to prevent CSRF on the OAuth flow.
- Email body is stored following the same encryption path as all communication records —
  through the existing withTenant() + encrypted-at-rest pattern.
- Never store the full email body in a log or audit event — only subject and direction.
- Write audit event 'email_sync_connected', 'email_sync_synced' (count only),
  'email_sync_disconnected' per user action.

Generate Drizzle migration: pnpm --filter server db:generate

ACCEPTANCE CRITERIA:
□ pnpm --filter server typecheck passes
□ OAuth flow returns a valid auth URL for Microsoft and Google
□ Tokens are stored encrypted (verify by reading raw DB row)
□ Sync fetches emails and creates communication records with externalId set
□ Duplicate emails (same externalId) are skipped on re-sync
□ Revoking disconnects tokens and deletes DB record
□ Settings UI hidden in offline-web build
□ Audit events written for connect/sync/disconnect
PROMPT 14 — Mobile (Capacitor): Full Implementation

You are completing the Capacitor mobile app implementation in the Task App CRM monorepo
(d:\techkeycrmapp). The scaffold exists at apps/mobile/ but Capacitor is not installed.

Read CLAUDE.md, apps/mobile/README.md (MASVS requirements), and
packages/adapter-mobile-native/src/ fully before starting.
All MASVS 2.0 criteria in the README are acceptance criteria for this prompt.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: INSTALL CAPACITOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In apps/mobile/:
pnpm add @capacitor/core @capacitor/cli @capacitor/filesystem @capacitor/biometrics
npx cap add ios
npx cap add android

Verify capacitor.config.ts has androidScheme:'https' and no external navigation.
Verify android NSC and iOS ATS are enforced (already scaffolded — do not weaken).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: CONCRETE MobileNativeVaultAdapter
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implement in packages/adapter-mobile-native/src/mobile-vault-adapter.ts.
The abstract base is already defined — implement the concrete subclass:

ConcreteMobileVaultAdapter extends MobileVaultAdapter:
async write(encryptedVaultBlob: Uint8Array): Promise<void>
— Uses @capacitor/filesystem Filesystem.writeFile with:
path: 'taskapp-vault/vault.enc'
directory: Directory.Library (iOS) / Directory.Data (Android)
encoding: 'base64' (convert Uint8Array to base64 using u8ToBase64 from crypto.ts)
— Atomic write: write to vault.enc.tmp, then rename to vault.enc.
— Verify the directory is NOT in the iCloud / auto-backup scope.

    async read(): Promise<Uint8Array | null>
      — Uses Filesystem.readFile with same path/directory.
      — Returns null if file does not exist (first launch).

    async delete(): Promise<void>
      — Uses Filesystem.deleteFile.

    async exists(): Promise<boolean>
      — Uses Filesystem.stat.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: CONCRETE BiometricUnlockAdapter
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implement in packages/adapter-mobile-native/src/biometric-unlock-adapter.ts:

ConcreteBiometricAdapter extends BiometricUnlockAdapter:
async storeWrappedKey(wrappedKey: Uint8Array, credentialId: string): Promise<void>
— On iOS: store in Keychain via @capacitor/biometrics using
kSecAccessControlBiometryAny + kSecAttrAccessibleWhenUnlockedThisDeviceOnly.
kSecAttrSynchronizable: false — never synced to iCloud.
— On Android: store in Keystore with setInvalidatedByBiometricEnrollment(true).
— Key is the AES-KW wrapped master key, never the raw password.

    async retrieveWrappedKey(credentialId: string): Promise<Uint8Array | null>
      — Triggers biometric prompt. Returns null if cancelled or failed.
      — Never retry automatically on failure — propagate error to UI.

    async deleteStoredKey(credentialId: string): Promise<void>
      — Removes from Keychain/Keystore.

    async isAvailable(): Promise<boolean>
      — Checks if biometric hardware exists and is enrolled.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4: WIRE THE ENTRY POINT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace the stub in apps/mobile/src/entry.ts with the real wiring order
(documented in that file). Import and call in this exact sequence:

1. assertNetworkPolicyCompliant(OFFLINE_MOBILE_NETWORK_POLICY)
2. setDeploymentPolicy(MOBILE_OFFLINE_PROFILE.policy)
3. setAdapter(new NullAdapter())
4. setStorageAdapter(new ConcreteMobileVaultAdapter())
5. setNativeSecurityAdapter(new ConcreteBiometricAdapter())
6. init()

Create config/build-profiles/mobile-offline.profile.ts if it does not exist:
MOBILE_OFFLINE_PROFILE.policy = { allowedTiers: ['browser'], requireServer: false }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5: BUILD + SYNC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pnpm run build:offline (builds dist/offline/index.html — the WebView bundle)
cd apps/mobile && npx cap sync (copies dist/ to native platform projects)

Verify:
iOS: Info.plist has NSFaceIDUsageDescription.
Android: AndroidManifest.xml references network_security_config.
PrivacyInfo.xcprivacy updated for @capacitor/filesystem file timestamp access.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSIVE UI ADJUSTMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to packages/core/src/styles/main.css:
Touch target minimum size: 44×44px (WCAG 2.5.5 / Apple HIG / Android Material 3).
Safe area insets: env(safe-area-inset-\*) for iPhone notch / Android cutout.
Sidebar collapses fully on viewport width < 768px (hamburger menu).
Kanban board: horizontal scroll with scroll-snap on mobile.
Font sizes scale with system font size preference (use rem, not px for text).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MASVS 2.0 ACCEPTANCE CRITERIA (from README)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ MASVS-STORAGE-1: vault.enc in platform-private directory, not world-readable
□ MASVS-STORAGE-2: no sensitive data in SharedPreferences / UserDefaults
□ MASVS-CRYPTO-1: AES-256-GCM + PBKDF2-HMAC-SHA-256 at 600k iterations confirmed
□ MASVS-AUTH-1: Android biometric key invalidated on enrollment change
□ MASVS-NETWORK-1: cleartext traffic blocked; confirmed via MITM proxy test
□ MASVS-PLATFORM-1: only required Capacitor plugins enabled; no broad JS bridge
□ pnpm run typecheck passes
□ npx cap sync completes without errors
□ Voice input privacy notice shown on first use (HIPAA-aware, from Prompt 9)
PROMPT 15 — Dataverse Adapter: Full Implementation

You are completing the DataverseAdapter in the Task App CRM monorepo (d:\techkeycrmapp).
The stub is at packages/adapter-dataverse/src/index.ts.
Read CLAUDE.md and apps/dataverse/src/entry.ts fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATAVERSE ADAPTER IMPLEMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The adapter must implement the 4-method interface from adapter-interface.ts:
pull(checkpoint), push(changes), stream(onRemoteChange), clear()

DataverseAdapter constructor params:
environmentUrl: string (e.g. https://org.crm.dynamics.com)
getAccessToken: () => Promise<string> (MSAL token; not a static string — must refresh)
entityMap: Record<string, string> (internal store → Dataverse entity set name)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MSAL TOKEN ACQUISITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Install @azure/msal-browser in the dataverse app package:
pnpm --filter dataverse add @azure/msal-browser

Create apps/dataverse/src/msal-auth.ts:
msalConfig: PublicClientApplication configured with:
auth.clientId from import.meta.env.VITE_DATAVERSE_CLIENT_ID
auth.authority: https://login.microsoftonline.com/{VITE_DATAVERSE_TENANT_ID}
auth.redirectUri: window.location.origin

acquireToken(scopes: string[]): Promise<string>
— Uses acquireTokenSilent first (checks cache)
— Falls back to acquireTokenPopup on InteractionRequiredAuthError
— Returns access token string

In apps/dataverse/src/entry.ts:
Replace the static accessToken with: getAccessToken: () => acquireToken([environmentUrl + '/.default'])

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PULL (Dataverse → Local)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pull(checkpoint: { [store: string]: string } | null):
For each store in entityMap:
GET {environmentUrl}/api/data/v9.2/{entitySet}?$orderby=modifiedon asc
        &$filter=modifiedon gt {checkpoint[store] ?? '1970-01-01'}
&$top=200
Map Dataverse field names to internal field names (reverse entityMap + field transforms):
Dataverse '\_tktaskapp_name' → internal 'name' etc.
Return { records: MappedRecord[], checkpoint: { [store]: latestModifiedOn } }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PUSH (Local → Dataverse)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

push(changes: { store: string; record: unknown; operation: 'create'|'update'|'delete' }[]):
For each change:
Map internal fields to Dataverse field names.
create: POST {environmentUrl}/api/data/v9.2/{entitySet}
update: PATCH {environmentUrl}/api/data/v9.2/{entitySet}({id})
delete: DELETE {environmentUrl}/api/data/v9.2/{entitySet}({id})
Batch using $batch endpoint (OData v4 batch) for efficiency: max 1000 per batch.
Handle 412 Conflict (optimistic concurrency): return conflict list.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STREAM (real-time)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

stream(onRemoteChange):
Use SignalR (Dataverse real-time API) via @microsoft/signalr if available.
Fallback: poll every 60 seconds (pull with updated checkpoint).
Returns unsubscribe function that disconnects SignalR or stops poll interval.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POWER PLATFORM TABLE PROVISIONING SCRIPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: apps/dataverse/scripts/provision-tables.ps1
PowerShell script using Power Platform CLI (pac) to create all CRM tables
in a target environment. Tables to create: all entries in entityMap plus
the new 'deals' and 'pipelines' tables (added in Prompt 2).
Include: string, integer, datetime, lookup columns for FK relationships.
Document: run once per environment before first deployment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECURITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Access token obtained via MSAL — never store raw token in localStorage.
  MSAL handles its own token cache (sessionStorage by default in MSAL-browser).
- All API calls use HTTPS (Dataverse API is always HTTPS).
- Zod-validate all pull responses before passing to the app layer.
- Errors from Dataverse API (4xx, 5xx) must be caught; never expose raw error to UI —
  surface as "Sync error: please try again" with details in console.warn only.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes
□ pull() returns mapped records for all entity types
□ push() creates a record in Dataverse for a newly created client
□ MSAL token is acquired silently on second call (cache hit)
□ Batch push handles 100 changes without exceeding rate limits
□ Zod validation rejects malformed Dataverse responses
□ provision-tables.ps1 documented with prerequisite pac login steps
PROMPT 16 — HIPAA Compliance

You are implementing HIPAA compliance controls in the Task App CRM monorepo
(d:\techkeycrmapp). HIPAA applies when the active vertical profile has
complianceFlags.hipaa === true (healthcare profile from Prompt 1).

Read CLAUDE.md fully. All existing security rules still apply.
Search for 2026 HIPAA technical safeguard requirements before implementing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHI FIELD PROTECTION (Technical Safeguards — 45 CFR §164.312)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When hipaa flag is active:

- Custom fields marked hipaaClassified:true (from Prompt 1) must:
  a. Never appear in CSV exports without explicit user confirmation + audit event.
  b. Never be sent to any AI (voice input Prompt 9, email parser Prompt 12,
  agent loop Prompt 7, document summarizer). Replace with "[PHI REDACTED]" before any AI call.
  c. Always write an 'phi_field_accessed' audit event (userId, fieldKey, entityId, timestamp)
  when the field value is read from storage and rendered to UI.
  d. Never appear in notification titles or bodies (truncate to "[PHI field]").
- Create packages/core/src/security/hipaa.ts:
  isHipaaActive(): boolean — reads from active vertical profile
  phiGuard(fieldKey: string, value: unknown): unknown
  — if isHipaaActive() and field is hipaaClassified: log audit event; return value
  — else: return value unchanged
  stripPhiForAi(record: Record<string, unknown>, entityType: string): Record<string, unknown>
  — replaces all hipaaClassified field values with "[PHI REDACTED]"
  confirmPhiExport(): Promise<boolean>
  — shows a modal: "This export contains Protected Health Information (PHI).
  Ensure the recipient is authorized under your BAA. Proceed?"
  — returns true only if user confirms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION TIMEOUT (45 CFR §164.312(a)(2)(iii))
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When hipaa flag is active:
Auto-logout after 15 minutes of inactivity (no mouse/keyboard/touch events).
Show a 60-second countdown warning modal before logout.
On auto-logout: call the existing logout/session-clear function in security/auth.ts,
clear the session CryptoKey from IDB (nexus_keys_v1).
Track last activity via mousemove, keydown, touchstart events on document.
Store setting: configurable timeout (5–30 min) in Settings, HIPAA section.
Persist in localStorage 'taskapp_hipaa_timeout_v1'.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MINIMUM NECESSARY PRINCIPLE (45 CFR §164.502(b))
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a "HIPAA Role" field to user settings (when hipaa is active):
Roles: 'treating_provider' | 'billing' | 'admin' | 'clerical'
Role stored in localStorage (not vault — it is not PHI itself).
If role is 'billing' or 'clerical': hipaaClassified fields are hidden in UI
(rendered as "\*\*\*\*" with a "Request access" button that creates a notification
for the admin).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVER-SIDE HIPAA CONTROLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In server/src/middleware/ create hipaa.middleware.ts:
hipaaMiddleware(): runs when X-Hipaa-Profile: true header is present.
Adds phi_access audit events for any response body containing hipaaClassified fields.
Strips phi fields from error responses entirely.

Add to .env.example: HIPAA_MODE=false and HIPAA_TIMEOUT_MINUTES=15.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETTINGS UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add "HIPAA Controls" section in Settings (visible only when hipaa profile active):

- Session timeout slider (5–30 min)
- HIPAA Role selector
- "View PHI Access Log" → filtered audit log for phi_field_accessed events
- BAA acknowledgment: checkbox "I acknowledge this deployment has a signed BAA
  with TechKey Cloud" — stored in localStorage 'taskapp_hipaa_baa_ack_v1'.
  Warning banner shown until BAA is acknowledged.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ PHI field renders "\*\*\*\*" for clerical role users
□ AI call strips PHI fields and replaces with "[PHI REDACTED]"
□ 'phi_field_accessed' audit event written on PHI field render
□ Auto-logout fires after configured inactivity period with countdown modal
□ CSV export of PHI shows confirmation modal before proceeding
□ BAA acknowledgment banner visible on healthcare profile until acknowledged
PROMPT 17 — EU AI Act Compliance

You are implementing EU AI Act 2026 compliance controls for the AI features in the
Task App CRM monorepo (d:\techkeycrmapp). The EU AI Act is in full enforcement as
of August 2026. This applies when complianceFlags.euAiAct === true (general-b2b,
healthcare, consulting profiles).

Read CLAUDE.md fully. Search for the EU AI Act 2026 enforcement requirements for
limited-risk and minimal-risk AI systems before implementing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI SYSTEM CLASSIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This CRM's AI features classify as:

- Lead scoring: "limited-risk" (AI-assisted decision support on natural persons)
- Automation rule suggestions: "minimal-risk"
- Document summarization: "minimal-risk"
- Agent loop insights: "minimal-risk"
- Agentic actions (stage moves, task creation): "limited-risk" when applied to people records

Create: packages/core/src/security/eu-ai-act.ts

AiSystemDisclosure:
systemName: string
classification: 'minimal-risk' | 'limited-risk' | 'high-risk'
purpose: string
humanOversightMechanism: string
dataUsed: string[]
doesNotMakeBinding Decisions: boolean

EU_AI_DISCLOSURES: AiSystemDisclosure[] = [
{ systemName: 'Lead Scoring', classification: 'limited-risk', ... },
{ systemName: 'Workflow Rule Suggestions', classification: 'minimal-risk', ... },
{ systemName: 'Document Summarization', classification: 'minimal-risk', ... },
{ systemName: 'Agentic Insights', classification: 'minimal-risk', ... },
]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSPARENCY OBLIGATIONS (Article 52)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Required for limited-risk systems (lead scoring, agentic decisions about people):
Every AI-generated output that affects a person record must show an "AI" badge.
Clicking the badge opens the disclosure panel showing: system name, classification,
what data was used, that no binding decisions are made automatically, and
human oversight mechanism.

Implement renderAiBadge(systemName: string): string in ui/components.ts.
Implement renderAiDisclosurePanel(systemName: string): string in ai/ai-ui.ts.
Apply to: lead score badges (Prompt 5), AI insights (Prompt 7), AI rule suggestions (Prompt 6).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HUMAN OVERSIGHT (Article 14 — Limited Risk)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For any AI action that would modify a record about a natural person (people entity):
Require explicit user confirmation before executing.
The confirmation dialog must include the disclosure text and the AI badge.
This is enforced in rule-engine.ts (Prompt 6): set requiresHumanApproval:true
automatically for any action targeting entityType:'person'.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI AUDIT TRAIL (Article 12 — Record Keeping)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All AI interactions must be logged to the audit log with:
eventType: 'ai_decision' | 'ai_recommendation' | 'ai_content_generated'
systemName: string (from EU_AI_DISCLOSURES)
inputSummary: string (no raw content — describe what data type was used)
outputSummary: string (classification result, recommendation type, etc. — no raw content)
humanApproval: boolean (was human approval required and obtained?)
modelUsed: string (backend tier: 'browser-nano', 'ollama', 'anthropic', etc.)
timestamp: string

Ensure all AI calls in: lead-scoring.ts, ai-agent.ts, ai-tools.ts, ai-settings.ts,
voice-input.ts, import-export.ts write this audit event.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USER RIGHTS (Article 86 — Right to Explanation)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to Settings > AI Governance:

- "AI Systems in use" — list of EU_AI_DISCLOSURES with their classifications.
- "My AI Interaction Log" — filtered audit log of ai_decision events.
- "Opt out of AI scoring" — toggle that sets aiPrefs.leadScoringEnabled:false.
  Lead score badges are hidden, scoring stops running.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INITIAL CONSENT NOTICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

On first AI use (when AI becomes ready for the first time), show a modal:
"This application uses AI features. [List limited-risk features]. These systems
assist you in making decisions but do not make binding decisions autonomously.
[Learn more about our AI systems] [I understand — Continue] [Disable AI features]"
Store acknowledgment in aiPrefs (not localStorage directly — store on aiPrefs object).

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Lead score badge shows "AI" indicator, clicking opens disclosure panel
□ Automation rule affecting a person entity requires human approval confirmation
□ 'ai_decision' audit event written for every AI output
□ AI consent notice shown on first AI use, stored in aiPrefs
□ AI Governance settings section shows all disclosed systems
□ Opt-out disables scoring badges and stops scoringEngine.scoreAllDeals
PROMPT 18 — SOC 2 Type II Compliance

You are implementing SOC 2 Type II compliance controls in the Task App CRM monorepo
(d:\techkeycrmapp). SOC 2 applies when complianceFlags.soc2 === true
(government-ot, consulting profiles).

Read CLAUDE.md fully. SOC 2 Type II covers: Security, Availability, Confidentiality.
Search for 2026 SOC 2 Type II technical control requirements before implementing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CC6 — LOGICAL AND PHYSICAL ACCESS CONTROLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Extend the existing auth lockout (already NIST AC-7 compliant) to also:

- Log every login attempt (success and failure) with timestamp in audit log.
  Event types: 'auth_success', 'auth_failure', 'auth_lockout'.
- Log every logout (manual and session timeout): 'auth_logout'.
- Audit log entries must be append-only (do not modify after write — already enforced
  by the append-only IDB store; document this explicitly in code comments).
- Add to Settings > Security: "Active Session" display showing last login time
  and last audit event. (For offline builds: read from audit log. For enterprise: API call.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CC7 — SYSTEM OPERATIONS MONITORING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Server (enterprise-web / pwa-sync builds):
The existing OTel metrics (server/src/observability/metrics.ts) already provide
RED metrics. Add these additional metrics: - auth_failure_total counter (labels: userId if available, ip) - vault_flush_duration_ms histogram - ai_call_duration_ms histogram (labels: provider tier) - workflow_rule_fired_total counter (labels: ruleId, actionType)

Create: server/src/observability/soc2-events.ts
logSoc2Event(type: string, details: Record<string, unknown>): void
— Wraps writeAuditEvent for SOC 2-classified events.
— Adds 'soc2': true flag to audit record for filtering.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CC9 — RISK MITIGATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/security/integrity.ts

checkAppIntegrity(): Promise<{ ok: boolean; issues: string[] }>
— Verifies dist/offline/index.sha256 matches the loaded file hash
(only meaningful in enterprise/pwa where the app is served, not file://).
In offline-web: skip this check.
— Verifies IDB database names match expected constants (detect tampering).
— Verifies the vault can be decrypted with the current session key
(call a lightweight decrypt probe on vault metadata, not full data).
— Returns list of integrity issues (empty = healthy).

Run checkAppIntegrity() on every app startup. If issues found:
Log 'integrity_check_failed' audit event.
Show a non-dismissable warning banner in the UI.
Do NOT block the user — log and warn only (SOC 2 requires detection, not prevention).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A1 — AVAILABILITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to Settings > SOC 2 (visible when soc2 flag active):

- "Vault backup status" — shows last vault flush time and whether FS file is ready
  (from storage/fs.ts isFsReady()). Prompt to set up file system backup if not ready.
- "Export audit log" button (already exists — surface here too with SOC 2 context label).
- "Data retention policy" — configurable auto-delete of audit events older than N days
  (default: 365). Stored in Settings. Actual deletion on next app load if enabled.

Server:
Verify the existing SLO requirements in enterprise-web/src/entry.ts are tested:
P99 < 500ms, error rate < 0.1%, uptime > 99.9%.
Create: server/src/observability/slo-check.ts
Exports getSloReport(): { p99LatencyMs: number; errorRatePct: number }
Reads from in-memory metrics (OtelServiceImpl).
Mount at GET /api/v1/admin/slo-report (admin role only via OPA).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
C1 — CONFIDENTIALITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add "Confidentiality classification" field to Documents and Files entities:
classification: 'public' | 'internal' | 'confidential' | 'restricted'
(stored as a standard field, not a custom field — add to the Zod schemas)

'restricted' documents: rendered with a red "RESTRICTED" watermark in the document viewer.
'confidential' or 'restricted': excluded from AI document summarization (Prompt 7)
unless user explicitly unlocks with a confirmation modal.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline, pnpm --filter server typecheck pass
□ auth_success / auth_failure / auth_logout audit events written correctly
□ Server: auth_failure_total metric increments on failed login
□ Integrity check runs on startup; integrity_check_failed event written on failure
□ SOC 2 Settings section shows vault backup status and data retention controls
□ 'restricted' documents show watermark in viewer
□ 'confidential' docs require confirmation before AI summarization
PROMPT 19 — CCPA Compliance

You are implementing CCPA (California Consumer Privacy Act) compliance controls
in the Task App CRM monorepo (d:\techkeycrmapp). CCPA applies when
complianceFlags.ccpa === true (general-b2b, healthcare, consulting profiles).

Read CLAUDE.md fully. Search for 2026 CCPA and CPRA enforcement requirements
before implementing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RIGHT TO KNOW (CCPA §1798.110)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/security/ccpa.ts

generateDataInventory(state: AppState): DataInventoryReport
Returns a structured report of all personal data stored in this app:
entityType, recordCount, fieldsContainingPersonalData: string[],
storageLocation: 'vault' | 'idb' | 'localstorage',
retentionPeriodDays: number | null (null = indefinite),
sharedWithThirdParties: boolean (always false in offline builds)

DataInventoryReport rendered in Settings > Privacy (when ccpa flag active) as:
A table: Data Category | Records | Personal Fields | Storage | Retention
"Download data inventory" button — exports as JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RIGHT TO DELETE (CCPA §1798.105)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to Settings > Privacy:
"Delete all my data" section.
Button: "Request Data Deletion" — opens a multi-step confirmation:
Step 1: "This will permanently delete ALL your CRM data. This cannot be undone.
Type DELETE to confirm."
Step 2: Shows data inventory of what will be deleted.
Step 3: Confirm button.
On confirm: execute the GDPR erasure workflow that already exists in the codebase
(server/src/kms/erasure-workflow.ts for enterprise; for offline builds: clear all
IDB databases using the existing clear() functions, clear localStorage keys,
then redirect to the setup/login screen).
Write 'ccpa_deletion_requested' and 'ccpa_deletion_completed' audit events.
The 'ccpa_deletion_completed' event is written BEFORE the final IDB clear
(it must survive in the downloaded audit log export).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RIGHT TO OPT OUT OF SALE (CCPA §1798.120)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This app does not sell personal data (it is offline-first, no third-party data sharing).
Add a clear statement in Settings > Privacy: "We do not sell or share your personal data
with third parties. Your data is stored locally on your device and never transmitted to
external servers unless you connect a sync service."

If a sync adapter is connected (non-NullAdapter): add:
"Your data syncs with: [adapter name]. Review their privacy policy here."
(adapter name and privacy policy URL are properties to add to the adapter interface)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RIGHT TO CORRECT (CPRA §1798.106)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is already supported by the existing edit flows. Add a note in Settings > Privacy:
"You can correct any personal data by editing the relevant record in the app."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA RETENTION CONTROLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In Settings > Privacy:
"Auto-delete records" section per entity type:
Toggle + number of days input per entity.
"Communications older than 3 years → auto-delete"
"Trash items older than 30 days → auto-delete" (already exists? surface here)
"Audit log older than 1 year → archive (export + delete)"
On each app startup, run the retention policy:
For each configured entity: call softDelete for records older than threshold.
For audit log: offer export-then-delete.
Persist retention settings in localStorage 'taskapp_ccpa_retention_v1'.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY NOTICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a "Privacy Notice" page accessible from Settings > Privacy and the login/setup screen.
Content must include:

- Categories of personal data collected
- Purpose of collection (CRM management, not advertising)
- Whether data is sold (it is not)
- How to exercise CCPA rights (links to the delete and inventory sections above)
- Contact: developer@techkeycloud.com
- Effective date (use the current date at build time via **APP_VERSION** or a new
  build constant **BUILD_DATE** injected in vite.config.ts)

Render the privacy notice in a read-only modal from packages/core/src/views/privacy-notice.ts.
Use getTerm() for entity terminology. All content is hardcoded (not user-input), so
escH() wrapping is not required, but still use \_rawPolicy TrustedHTML for innerHTML.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Data inventory renders correct record counts and fields
□ "Download data inventory" exports valid JSON
□ Data deletion flow executes and clears all IDB stores
□ 'ccpa_deletion_completed' audit event exportable before final clear
□ Data retention policy runs on startup and soft
You've hit your session limit · resets 3:30pm (America/Denver)

continue
Completing PROMPT 19 and adding the implementation index:

-deletes records past their threshold
□ Privacy notice accessible from Settings and login screen
□ No-sale statement visible; adapter name shown when sync is connected
□ Retention settings persist and apply on next app load
Implementation Index & Sequence Guide

IMPLEMENTATION ORDER — run prompts in this sequence.
Each prompt depends on those marked with ← before it.

PHASE 1 — FOUNDATION (run first; everything depends on this)
PROMPT 1 Industry Vertical Profiles + Custom Fields
PROMPT 2 Deals Entity + Pipeline Schema ← Prompt 1

PHASE 2 — CORE CRM FEATURES
PROMPT 3 Pipeline / Kanban View ← Prompts 1, 2
PROMPT 4 Sales Forecasting Dashboard ← Prompts 2, 3
PROMPT 5 Lead Scoring Engine ← Prompts 1, 2
PROMPT 6 Workflow Automation Rule Engine ← Prompts 1, 2

PHASE 3 — AI INTEGRATION
PROMPT 7 Agentic AI Agent Loop ← Prompts 5, 6
PROMPT 8 Duplicate Detection ← Prompt 7

PHASE 4 — DATA MANAGEMENT & INPUT
PROMPT 9 Voice Input ← any order after Phase 1
PROMPT 10 CSV Bulk Import ← Prompts 1, 8
PROMPT 11 Omnichannel Communications Log ← Prompt 1
PROMPT 12 Email Integration — Offline AI ← Prompts 7, 11
PROMPT 13 Email Integration — Server OAuth2 ← Prompt 11 (server only)

PHASE 5 — PLATFORM BUILDS
PROMPT 14 Mobile (Capacitor) Full Implementation ← all Phase 1-4 complete
PROMPT 15 Dataverse Adapter Completion ← Prompt 2

PHASE 6 — COMPLIANCE (can run in parallel with Phase 5)
PROMPT 16 HIPAA Compliance ← Prompts 1, 7, 9, 10
PROMPT 17 EU AI Act Compliance ← Prompts 5, 6, 7
PROMPT 18 SOC 2 Type II ← Prompts 6, 7
PROMPT 19 CCPA Compliance ← Prompt 16

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD COVERAGE MATRIX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Feature offline-web pwa-sync dataverse mobile enterprise-web
──────────────────────────────────────────────────────────────────────────────────────
Vertical Profiles ✓ ✓ ✓ ✓ ✓
Custom Fields ✓ ✓ ✓ ✓ ✓
Deals / Pipeline Kanban ✓ ✓ ✓ ✓ ✓
Sales Forecasting ✓ ✓ ✓ ✓ ✓
Lead Scoring ✓ ✓ ✓ ✓ ✓
Workflow Automation ✓ ✓ ✓ ✓ ✓ (+ server triggers)
Agentic AI ✓ (on-device) ✓ ✓ ✓ ✓ (+ cloud AI)
Duplicate Detection ✓ ✓ ✓ ✓ ✓
Voice Input ✓ ✓ — ✓ ✓
CSV Bulk Import ✓ ✓ ✓ ✓ ✓
Omnichannel Communications ✓ ✓ ✓ ✓ ✓
Email: AI-assisted logging ✓ ✓ — ✓ —
Email: OAuth2 sync — ✓ — — ✓
Mobile (Capacitor) — — — ✓ —
Dataverse Adapter — — ✓ — —
HIPAA Controls ✓ ✓ ✓ ✓ ✓
EU AI Act Controls ✓ ✓ ✓ ✓ ✓
SOC 2 Controls partial ✓ partial partial ✓ (full)
CCPA Controls ✓ ✓ ✓ ✓ ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEFORE RUNNING ANY PROMPT — CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

□ pnpm run typecheck passes on current main branch (baseline)
□ pnpm run build:offline produces a working dist/offline/index.html (baseline)
□ You are on a feature branch (not main)
□ Each prompt should be run in a separate branch and PR
□ After each prompt: pnpm run typecheck + pnpm run build:offline must pass
before merging and starting the next prompt
□ After every prompt that changes documented facts: update CLAUDE.md,
TECHNICAL-REFERENCE.md, CHANGELOG.md (this is already in each prompt)
Update Todos

Write all 19 implementation prompts
You've hit your session limit · resets 2pm (America/Denver)

d:\techkeycrmapp\docs\reports\2026-05-21-ui-redesign\FUTURE-UI-REDESIGN-STRATEGY.md
continue
Let me read that file to understand what you're pointing me to.

Read d:\techkeycrmapp\docs\reports\2026-05-21-ui-redesign\FUTURE-UI-REDESIGN-STRATEGY.md
This is the UI redesign strategy. I'll continue with the remaining implementation prompts — UI Redesign Phase 1 through Phase 5 (PROMPT 20–30), matching the same depth and style.

PROMPT 20 — Design Token System + Shared Component Library

You are implementing the UI Foundation layer for the Task App CRM redesign
(d:\techkeycrmapp). This is Phase 1 of the UI redesign strategy documented in
docs/reports/2026-05-21-ui-redesign/FUTURE-UI-REDESIGN-STRATEGY.md.

Read CLAUDE.md and the redesign strategy fully before starting.
This prompt must be completed before PROMPT 21 through PROMPT 30.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESIGN TOKENS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/styles/tokens.css

Define CSS custom properties (variables) for every visual value used in the app.
No component should use a hardcoded color, radius, shadow, spacing, or font size —
only token references. Organize into these namespaces:

COLOR TOKENS:
/_ Neutral surface palette _/
--color-surface-0: #0f172a; /_ deepest bg _/
--color-surface-1: #1e293b; /_ panel bg _/
--color-surface-2: #334155; /_ card bg _/
--color-surface-3: #475569; /_ hover/active _/
--color-surface-border: #334155;

/_ Semantic text _/
--color-text-primary: #f1f5f9;
--color-text-secondary: #94a3b8;
--color-text-muted: #64748b;
--color-text-inverse: #0f172a;

/_ Semantic states _/
--color-info: #3b82f6; /_ blue _/
--color-info-subtle: #1e3a5f;
--color-success: #22c55e; /_ green _/
--color-success-subtle: #14532d;
--color-warning: #f59e0b; /_ amber _/
--color-warning-subtle: #451a03;
--color-danger: #ef4444; /_ red _/
--color-danger-subtle: #450a0a;

/_ AI/Intelligence accent — violet/teal only for AI surfaces _/
--color-ai-accent: #8b5cf6;
--color-ai-subtle: #2e1065;
--color-ai-teal: #14b8a6;

/_ Light mode overrides under [data-theme="light"] _/
[data-theme="light"] {
--color-surface-0: #f8fafc;
--color-surface-1: #f1f5f9;
--color-surface-2: #e2e8f0;
...
}

SPACING TOKENS (8px grid):
--space-1: 4px; --space-2: 8px; --space-3: 12px;
--space-4: 16px; --space-5: 20px; --space-6: 24px;
--space-8: 32px; --space-10: 40px; --space-12: 48px;
--space-16: 64px;

RADIUS TOKENS:
--radius-sm: 4px; /_ tags, badges _/
--radius-md: 8px; /_ cards, inputs (this is the default per strategy) _/
--radius-lg: 12px; /_ panels, modals _/
--radius-xl: 16px; /_ sheets, drawers _/
--radius-full: 9999px; /_ pills _/

TYPOGRAPHY TOKENS (rem only — never px for font sizes):
--font-family-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-family-mono: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
--text-xs: 0.75rem; /_ 12px _/
--text-sm: 0.875rem; /_ 14px _/
--text-base: 1rem; /_ 16px _/
--text-lg: 1.125rem; /_ 18px _/
--text-xl: 1.25rem; /_ 20px _/
--text-2xl: 1.5rem; /_ 24px _/
--text-3xl: 1.875rem; /_ 30px _/
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
--leading-tight: 1.25;
--leading-normal: 1.5;

SHADOW TOKENS:
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.5);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.5);

TRANSITION TOKENS:
--transition-fast: 100ms ease;
--transition-base: 200ms ease;
--transition-slow: 300ms ease;

DENSITY TOKENS (updated by density mode setting):
--density-row-height: 44px; /_ comfortable _/
--density-cell-pad-y: 10px;
--density-cell-pad-x: 16px;

.density-compact {
--density-row-height: 32px;
--density-cell-pad-y: 6px;
--density-cell-pad-x: 12px;
}
.density-spacious {
--density-row-height: 56px;
--density-cell-pad-y: 14px;
--density-cell-pad-x: 20px;
}

Import tokens.css at the very top of packages/core/src/styles/main.css,
before any other styles.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DENSITY MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add density: 'comfortable' | 'compact' | 'spacious' to AppState.
Apply class .density-compact or .density-spacious to the root #app element.
Persist preference in localStorage key 'taskapp_density_v1'.
Add density selector to Settings > Appearance.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT REFACTOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In packages/core/src/ui/components.ts, audit every inline style string.
Replace all hardcoded hex/rgba colors, px font sizes, px spacing values
with token references. Work systematically — one component at a time.
Do not change visual output; only replace hardcoded values with tokens.

Create these new reusable component functions (added to components.ts):

renderPanel(options: { title?: string; actions?: string; body: string;
variant?: 'default'|'ai'|'warning'|'danger' }): string
— A bordered panel with optional header. variant affects border color.

renderBadge(label: string, variant: 'info'|'success'|'warning'|'danger'|'ai'|'neutral',
size?: 'sm'|'md'): string
— Pill badge using semantic color tokens.

renderButton(label: string, options: { variant: 'primary'|'secondary'|'ghost'|'danger';
size?: 'sm'|'md'|'lg'; icon?: string; disabled?: boolean; dataAttrs?: Record<string,string> }): string
— Consistent button with all visual states via CSS.

renderSkeleton(lines: number, widths?: string[]): string
— Loading skeleton placeholder (CSS animation, no images).

renderEmptyState(icon: string, title: string, body: string, cta?: string): string
— Centered empty state for lists/views.

renderSplitPane(left: string, right: string, options?: { rightWidth?: string;
rightCollapsible?: boolean; rightDefaultOpen?: boolean }): string
— Two-column layout: main content left, context rail right.
— Right panel is collapsible (toggle via button, state in localStorage).

renderStickyActionBar(actions: string): string
— Fixed bottom bar for record pages. Actions are the buttons/links HTML.

renderDivider(label?: string): string
— Horizontal rule with optional centered label.

renderTimeline(items: TimelineItem[]): string (see PROMPT 26 for TimelineItem type)
— Chronological list with icons, timestamps, body.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOCUS TRAPS + MODAL ACCESSIBILITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/ui/focus-trap.ts

focusTrap(containerEl: HTMLElement): { activate(): void; deactivate(): void }
— On activate: find all focusable elements within container;
listen for Tab/Shift+Tab, wrap focus at boundaries.
— On deactivate: remove listeners, return focus to the element that opened the modal.
— Focusable selector: 'a[href], button:not([disabled]), input:not([disabled]),
select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

Apply focusTrap to every modal and dialog in the codebase.
Call activate() in the modal open handler and deactivate() in the close handler.
This is a blanket fix for the accessibility gap identified in the redesign strategy.

Aria requirements for all modals:
role="dialog", aria-modal="true", aria-labelledby pointing to the modal title.
Escape key closes modal and deactivates trap.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOCUS RINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to tokens.css:
:focus-visible {
outline: 2px solid var(--color-info);
outline-offset: 2px;
border-radius: var(--radius-sm);
}
:focus:not(:focus-visible) { outline: none; }

This replaces any existing focus styles. Verify 3:1 minimum contrast ratio
between focus ring and adjacent background for WCAG 2.2 SC 1.4.11.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCREEN READER UTILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to tokens.css:
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0;
margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
white-space: nowrap; border-width: 0; }

.live-region { /_ for dynamic content announcements _/ }

Add to components.ts:
renderLiveRegion(id: string): string
— <div id="${id}" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>

announceToScreenReader(regionId: string, message: string): void
— Updates the live region text content so screen readers announce it.

Audit all toast notifications, loading states, and async results —
they must use announceToScreenReader for screen reader users.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ App visual output is unchanged (pixel comparison baseline acceptable)
□ No hardcoded hex/rgb colors remain in components.ts
□ All modals trap focus; Escape closes; focus returns to trigger element
□ Tab navigation through all modals works without leaving the modal
□ Focus rings visible on all interactive elements in both themes
□ renderSplitPane renders and right panel is collapsible
□ Density: compact/comfortable/spacious changes row height measurably
PROMPT 21 — Command Center (Replace Dashboard)

You are implementing the Command Center to replace the existing dashboard in the
Task App CRM monorepo (d:\techkeycrmapp). This is Phase 2 of the UI redesign strategy
in docs/reports/2026-05-21-ui-redesign/FUTURE-UI-REDESIGN-STRATEGY.md.

Depends on: PROMPT 20 (design tokens), PROMPT 5 (lead scoring),
PROMPT 7 (agentic AI), PROMPT 6 (workflow automation).

Read CLAUDE.md and the redesign strategy fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMAND CENTER VIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace packages/core/src/views/dashboard.ts with the Command Center.
The currentView value 'dashboard' remains — this is a replacement, not a rename.
The existing movable-card-board layout is retired entirely.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use renderSplitPane() from PROMPT 20:
Left/main (70%): Now + Next + Pipeline Pulse + Recent Changes
Right rail (30%): Agent Activity + Team Load (collapsible)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — NOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"What needs attention right now."
Compute at render time (pure functions, no new storage):

Overdue Work:
Tasks where dueDate < today AND status !== 'done/completed'.
Projects where deadline < today AND status !== 'complete'.
Deals where closeDate < today AND not won/lost.
Each item: icon, entity type label, title, link to record, days overdue badge.

Due Today:
Same entities where date = today. Sorted by: deals > projects > tasks.

Waiting on Client:
Tasks/projects with a tag 'waiting-on-client' or a custom status meaning the same.
(Surface this; do not add new logic — if the tag exists, show it.)

Offline / Storage Alerts:
If isFsReady() === false: warning card "No backup file linked — vault data
exists only in browser storage."
If last vault flush > 10 minutes ago: info card "Vault not flushed recently."

Each card uses renderPanel() with appropriate variant.
Maximum 5 items per sub-section before "Show N more" collapse.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — NEXT BEST ACTIONS (AI-Generated Recommendations)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pulls from agentLoop.pendingInsights (PROMPT 7).
Renders as recommendation cards per the redesign strategy's example:

Each card:
Title (insight.title)
Body (insight.body) — expanded by default for action_required, collapsed for info
"Why this?" toggle → shows evidence (what data was used, timestamp, entity links)
Suggested action button (if present)
"Snooze" button (sets 24h timer in localStorage)
"Dismiss" button (X)
AI badge (PROMPT 17) top-right corner

The "Why this?" drawer is a key UX requirement from the strategy. Implement it as
an inline toggle (no new modal). Evidence = a brief list of contributing data points.

Show maximum 5 non-dismissed recommendations. "View all" links to Intelligence > Agents tab.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — PIPELINE PULSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mini pipeline health summary (data from forecast.ts, Prompt 4):
4 KPI pills: Open Deals | Expected Revenue | Stale Deals | Won This Month
At-risk deals list (from ForecastResult.atRisk — max 3 rows with "View all" link)
Each row: deal title, client, close date, days remaining, value.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — RECENT CHANGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chronological feed of the last 20 records changed (any entity type):
Icon + entity type + record title + change type + time ago.
"Changed by [AI]" badge if the change was triggered by the automation engine.
Click to open the record.

Derive from dbGetAll for each store, sorted by updatedAt desc, merged and trimmed to 20.
This is a pure client-side computation — no new storage.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RIGHT RAIL — AGENT ACTIVITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Shows the last N agent loop runs (from agentLoop, PROMPT 7):
Last run time, checks performed, insights generated.
Pending approval count with link to Intelligence > Actions tab (PROMPT 23).
Automation rules fired today (count from audit log).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RIGHT RAIL — TEAM LOAD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Visible only if any records have an ownerId field.
Horizontal bar per owner: name, open tasks count, open deals count.
Overloaded owners (> configurable threshold, default 10 open items) shown in amber.
This is a single-user app in offline mode — show "You" if no multi-user context.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SNOOZE SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Snooze stores { insightId, snoozedUntil: ISOString } array in
localStorage 'taskapp_snoozed_items_v1'.
On render: filter out snoozed items whose snoozedUntil > now.
Items reappear when snoozedUntil passes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEGACY DASHBOARD WIDGETS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If the existing dashboard had any user-configured layout stored in
localStorage 'taskapp_dash_v1': on first render after this update,
show a one-time notice: "Dashboard has been upgraded to Command Center.
Your previous layout has been archived." Clear the old key.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Command Center renders as the default 'dashboard' view
□ Overdue tasks/deals appear in the Now section
□ Recommendation card "Why this?" drawer opens and shows evidence
□ Snooze hides a recommendation for 24h and it reappears after
□ Pipeline Pulse KPI pills show correct values
□ Recent Changes feed shows last 20 records sorted by updatedAt
□ Right rail collapses and state persists across navigation
PROMPT 22 — Record 360 Pages

You are implementing Record 360 full-page layouts for the major CRM entities in the
Task App CRM monorepo (d:\techkeycrmapp). This replaces the current modal-only record
editing with a split-pane record page, per the redesign strategy in
docs/reports/2026-05-21-ui-redesign/FUTURE-UI-REDESIGN-STRATEGY.md.

Depends on: PROMPT 20 (renderSplitPane, renderStickyActionBar, renderTimeline).
Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARCHITECTURE DECISION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Record pages replace the full-screen modal for: Client, Project, Person, Deal.
Task remains a modal (smaller context) but gets an expanded form.
Documents keep their existing viewer.

Routing: add a recordPage: { type: string; id: string } | null field to AppState.
When recordPage is set, the main canvas renders the record page instead of the current view.
Back button / Escape clears recordPage and returns to previous view.
Browser back navigation should also clear recordPage (use history.pushState if available).

Add to main.ts: handle back button in history.popstate listener.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHARED RECORD PAGE LAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/ui/record-page.ts

renderRecordPageShell(options: {
breadcrumb: string (e.g. "Clients / Acme Corp")
title: string
subtitle?: string
statusBadge?: string (HTML from renderBadge)
headerActions: string (buttons HTML: edit, delete, more)
securityBadge?: string (sync status, encryption indicator)
leftContent: string
rightContent: string
rightTitle?: string
bottomBar: string (renderStickyActionBar content)
}): string

The shell uses renderSplitPane for left/right layout and renderStickyActionBar at bottom.
All section headers within left/right content use consistent typography tokens.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLIENT 360 PAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/views/client-page.ts

LEFT CONTENT:
Details section — all client fields, editable inline (click to edit, auto-save on blur).
Custom Fields section (from PROMPT 1, renderCustomFields).
Notes — textarea, auto-saved.
Communications Timeline — renderTimeline() with all communications linked to this client.
Include channel icon, direction, outcome, sentiment badge.
"Log Communication" button inline.

RIGHT CONTENT:
AI Account Brief — if AI ready: "AI Account Brief" panel.
Prompt: "In 2-3 sentences, summarize the current status of this client account
based on: [project count, last communication date, open tasks count, deal stage].
Be specific and direct."
Cached 4h in localStorage by clientId.

Health Score — computed from: days since last communication (40%),
open tasks (20%), deal stage (20%), project completion rate (20%).
0-100 with A-F grade (reuse renderScoreBadge from PROMPT 5).

Linked Items — count pills: Open Projects, Open Tasks, Open Deals, People, Files.
Each pill links to the relevant view filtered by this client.

Active People — list of people records linked to this client.
Name, role, last communication date, email.

Suggested Next Outreach — AI recommendation:
"Based on last communication [X days ago] and project status, suggested action: [action]."
Only shown if AI ready and last comms > 14 days ago.

BOTTOM BAR actions:
"Create Task" | "Log Communication" | "Add File" | "Start Timer" | "Ask AI"
Each opens the relevant create/action modal pre-linked to this client.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT 360 PAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/views/project-page.ts

LEFT CONTENT:
Details — stage, deadline, owner, linked client, description.
Task breakdown — grouped by status (todo/in-progress/done). Inline task status toggle.
Timeline — milestone events (stage changes from audit log + manual notes).
Files & Documents — list of attached files, download/view links.
Decision Log — a special tag or sub-collection of notes marked as decisions.
"Add decision" button.

RIGHT CONTENT:
AI Project Brief — prompt: "Summarize this project's current status and top risk
in 2 sentences. Data: [task completion %, deadline, open blockers, last update]."

Progress ring — CSS conic-gradient: tasks complete / total tasks %.

Risk Forecast: - Overdue tasks count - Days until deadline vs tasks remaining - "On track" | "At risk" | "Critical" computed status badge.

Related Deals — deals linked to this project.

Time Tracking summary — total hours logged, by person if available.

BOTTOM BAR: "Add Task" | "Add File" | "Log Time" | "Log Communication" | "Ask AI"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSON 360 PAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/views/person-page.ts

LEFT: Details, custom fields, linked client, notes.
Communications timeline (all comms with this person — filtered by personId on comms).

RIGHT: Lead score (if person is associated with a deal).
Linked deals, projects, tasks.
Last 3 communications summary.
HIPAA notice banner if hipaaClassified fields present (from PROMPT 16).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEAL 360 PAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The deal detail modal from PROMPT 3 is upgraded to a full record page.
Move its content into create: packages/core/src/views/deal-page.ts
using the same layout as Client 360. Keep the modal for quick-create/edit;
full page is for the detailed view (opened on deal title click vs edit icon click).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INLINE EDITING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implement inline editing via contenteditable or input reveal:
Click on a field value → it becomes an input.
On blur or Enter: call dbUpdate() with the changed field; show brief "Saved" flash.
On Escape: revert without saving.
Aria: aria-label for each editable field. Announce "Saved" to screen reader live region.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECURITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- All rendered field values through escH().
- AI briefs are cached in localStorage — ensure they contain no raw user content
  beyond what the AI model returned from anonymized prompts.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Clicking a client row opens the Client 360 page (not a modal)
□ AI Account Brief renders and caches correctly
□ Health score updates when communications are added
□ Inline edit saves on blur and announces "Saved"
□ Back navigation returns to client list
□ Project risk status badge shows correctly (On track / At risk / Critical)
□ Sticky action bar is visible and all buttons open correct modals
PROMPT 23 — AI Workbench

You are implementing the AI Workbench to replace the generic AI Chat view in the
Task App CRM monorepo (d:\techkeycrmapp). This is Phase 3 of the redesign strategy in
docs/reports/2026-05-21-ui-redesign/FUTURE-UI-REDESIGN-STRATEGY.md.

Depends on: PROMPT 20 (tokens), PROMPT 6 (automation), PROMPT 7 (agentic AI).
Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Replace the existing AI view (currentView:'ai') with the AI Workbench.
Implement as a tabbed layout in packages/core/src/views/ai-workbench.ts.
(Refactor the existing ai-ui.ts render/bind into this file or import from it.)

Tabs: Ask | Actions | Agents | Memory & Context | Runs

Use --color-ai-accent and --color-ai-subtle tokens for the Workbench chrome.
Add the sidebar nav badge (pending action count) to the 'ai' sidebar item.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAB 1 — ASK (existing AI chat, redesigned)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Retain the existing conversational interface from ai-ui.ts.
Improvements:

Action Cards — when the AI calls a tool (from ai-tools.ts), instead of showing raw JSON,
render a structured action card:
Tool name header (human-readable, e.g. "Create Task" not "create_task")
Field summary: title, dueDate, assignee — formatted as a readable list
Status: "Pending approval" | "Applied" | "Rejected"
Approve / Reject buttons (existing approval flow — just new visual treatment)

Plan Preview — if AI returns multiple tool calls in sequence (multi-step):
Render a numbered plan list before executing step 1.
"Would you like me to proceed? [Run plan] [Cancel]"
Each step shows status as it completes.

Evidence Disclosure — after every AI response:
Small collapsible section: "Records accessed" — list of entity types + counts
queried during this response. (Requires ai-tools.ts to emit what it read.)
Data boundary indicator: 🔒 "Processed on-device" (browser-ai profile) or
☁ "Processed by [provider]" (cloud profile).

Undo Route — for every successful create/update/delete action via AI:
Show an "Undo" button for 30 seconds after execution.
Undo calls dbDelete or restores the previous field values (keep a shallow copy
of pre-action state in memory — not persisted to vault).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAB 2 — ACTIONS (Pending Approvals)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Shows all pending approvals from:

- Automation rules with requiresHumanApproval:true (PROMPT 6)
- Agent loop suggested actions (PROMPT 7)
- AI Workbench multi-step plans awaiting confirmation

Each pending action card:
Source: "Automation Rule: Follow-up after 7 days" or "Agent: Stale deal detected"
Proposed change: human-readable description of the action
Entity link: opens the relevant record
Evidence/reason the action was proposed
Approval tiers (per strategy):
[Auto-read ✓] [Draft only] [Requires approval — Approve | Reject]
Timestamp when the action was proposed
Expiry: actions older than 7 days are auto-dismissed (archived, not deleted)

Bulk actions: "Approve all drafts" and "Dismiss all info" buttons at the top.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAB 3 — AGENTS (Agent Builder Lite)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Shows the list of agents (automation rules from PROMPT 6 plus named agent templates).
"Create Agent" button opens the agent builder.

Ship these 7 named agent templates as pre-built AutomationRule configs (aiGenerated:true,
isActive:false — user must activate). Store as constants in ai/agent-templates.ts:

1. Follow-up Assistant
   Trigger: time_elapsed (30 days since last communication, entity: deal)
   Actions: create_task("Follow up with [clientName]", due: +3 days, linked: deal)

2. Project Risk Scout
   Trigger: record_updated (project, deadline field changed or task completed)
   Condition: task completion < 50% AND days until deadline < 14
   Actions: create_notification("Project [name] may miss deadline") + ai_summarize (project record → brief risk note)

3. Meeting Notes Summarizer
   Trigger: communication_logged (type: video_call or in_person)
   Condition: notes length ≥ 100 chars
   Actions: ai_summarize → stores in communication.aiSummary + create_task("Review meeting notes") due: +1 day

4. Weekly Planner
   Trigger: time_elapsed (every Monday 9am — use service worker alarm in PWA,
   localStorage timestamp check on load in offline)
   Actions: ai_summarize → generates a weekly priorities brief
   (top 5 overdue items + top 3 deals at risk + top 2 projects near deadline)
   stored as a standalone note with title "Weekly Brief – [date]"

5. Data Cleanup Assistant
   Trigger: manual (user runs from agent list)
   Actions: duplicate detection scan (delegates to PROMPT 8) + find records missing required fields + report as notifications

6. Import Mapper
   Trigger: manual (opened from import flow — PROMPT 10)
   Actions: AI-maps CSV headers to CRM fields (already in Prompt 10; wire here)

7. Time Entry Reconciler
   Trigger: time_elapsed (every Friday 5pm)
   Condition: time entries with no linked project in current week
   Actions: create_notification("Unlinked time entries found")

Agent list card:
Name, description, trigger summary, last run, run count, On/Off toggle, "Run now" button.
Badge: "Template" for built-in agents, "AI Suggested" for PROMPT 6 AI-suggestions,
"Custom" for user-built.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAB 4 — MEMORY & CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Shows what the AI can access:

- Data access list: entity types + record counts the AI tools can read
- Current context: which record page is open (if any), active view
- Knowledge sources: documents marked as AI-accessible (a new boolean field
  'aiAccessible' on Document records — add to document.schema.ts, default true)
- Recent context window: last 5 AI chat exchanges (from aiRuntime.history)
- "Clear context" button: clears aiRuntime.history (existing disconnectAI flow)

Also shows the AI model in use: backend name, tier badge, privacy boundary.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAB 5 — RUNS (Agent Run History)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Persistent run history stored in IDB as '**agent_runs**' (add to IDB_STORES in constants.ts).

AgentRun record:
id, agentName, triggeredBy: 'manual'|'automation'|'schedule'|'agent_loop',
startedAt, completedAt, status: 'success'|'failed'|'cancelled'|'pending_approval',
actionsExecuted: { type, entityType, entityId, summary }[],
approvalRequired: boolean, approvalGranted?: boolean,
error?: string

Write an AgentRun record for:

- Every automation rule execution (PROMPT 6)
- Every agent loop cycle (PROMPT 7)
- Every AI action from the Ask tab

Run history list:
Date/time, agent name, trigger, status badge, actions count.
Expand row: show actionsExecuted details.
"View audit log" link filters the audit log to this run's timeframe.

Keep only the last 200 runs; prune oldest on write.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECURITY (per redesign strategy)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- No hidden autonomous work: every AI action is visible in the Runs tab.
- No agent writes bypass the requiresHumanApproval gate.
- Evidence links always show which records the AI accessed (records read, not content).
- Undo must not re-decrypt vault data — only use the in-memory shallow copy.
- AgentRun content must not log raw record content — only entity type + ID + action type.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ AI Workbench renders with all 5 tabs
□ Tool calls render as action cards, not raw JSON
□ Multi-step plan preview shows before execution
□ Undo button appears and reverts last AI action within 30s
□ 7 agent templates appear in Agents tab, all inactive by default
□ Agent run history written for every rule execution
□ Runs tab shows last 200 runs with expandable details
□ Memory & Context tab shows current AI data access correctly
PROMPT 24 — Universal Command Palette Upgrade

You are upgrading the Universal Command Palette in the Task App CRM monorepo
(d:\techkeycrmapp) to match the redesign strategy in
docs/reports/2026-05-21-ui-redesign/FUTURE-UI-REDESIGN-STRATEGY.md.

Depends on: PROMPT 20 (tokens), PROMPT 23 (AI Workbench).
Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The app already has a command palette (commandOpen: boolean in AppState).
This prompt upgrades it — do not rebuild from scratch, extend what exists.
Read the current implementation in main.ts and components.ts to understand
the existing keybinding and render/bind pattern before making changes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UNIFIED SEARCH INPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Single input with prefix routing:
No prefix → global record search (all entity types)

> → commands (e.g. "> create task", "> export")
> @ → people/contacts search

# → tag search / filter

? → ask AI (sends to AI Workbench Ask tab)
/ → navigate to view (e.g. "/pipeline", "/settings")

The prefix is shown as a colored badge to the left of the input once detected.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESULT SECTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Results are grouped into labeled sections:
RECORDS — fuzzy search across clients, deals, people, projects, tasks.
Each result: entity icon, title, subtitle (client name or status), keyboard shortcut.
COMMANDS — predefined action list filtered by query.
Commands include: Create [entity], Export, Import, Switch view,
Start timer, Open settings, View audit log, Run agent [name].
AI — if query starts with ? or is a natural language question:
One result: "Ask AI: [query]" — pressing Enter opens AI Workbench with query pre-filled.
AGENTS — filtered list of available agents matching the query.
RECENT — last 5 viewed records (from AppState or localStorage).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEYBOARD NAVIGATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ctrl+K (Windows/Linux) / Cmd+K (Mac): open palette.
Escape: close.
Arrow Up/Down: navigate results.
Enter: execute selected result.
Tab: move between sections.
Results are announced to screen readers via aria-activedescendant pattern.
Role="combobox" on input, role="listbox" on results, role="option" on each result.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FUZZY SEARCH IMPLEMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implement a simple in-memory fuzzy search (no external library):
scoreMatch(query: string, target: string): number
— Returns 0-100. Exact match = 100. Substring match = 80. Subsequence = 50. No match = 0.
— Case insensitive.

Highlight matching characters in result labels:
wrapMatches(query: string, target: string): string
— Returns the target string with matching chars wrapped in <mark> tags.
— All output still goes through escH() before the <mark> wrapping.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FREQUENT / RECENT ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Track command usage in localStorage 'taskapp_cmd_freq_v1':
{ commandId: string; count: number }[]
Sort commands by frequency descending when no query is typed.
Show "Recent" records (last 5 viewed) when palette opens with no query.
Recent viewed records tracked in localStorage 'taskapp_recent_views_v1':
{ type, id, label, viewedAt }[] (max 20 entries, most recent first).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE COMMAND INTEGRATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a microphone button inside the palette input.
On click: starts voiceInput.startListening() (from PROMPT 9).
Interim transcript shows in the input as it comes in.
On final result: treat as a ? prefixed AI query if it's a sentence,
or as a search query if it's short (< 5 words).

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Ctrl+K opens palette; Escape closes
□ Searching "acme" finds clients, deals, projects containing "acme"
□ > prefix shows command list
□ ? prefix routes to AI Workbench with pre-filled query
□ Matching characters are highlighted in results
□ Frequent commands appear first when palette opens blank
□ Voice microphone button triggers voice input and populates search
□ All keyboard navigation works without mouse
PROMPT 25 — Relationship Graph + Timeline

You are implementing the Relationship Graph and unified Timeline per the redesign
strategy in docs/reports/2026-05-21-ui-redesign/FUTURE-UI-REDESIGN-STRATEGY.md.

Depends on: PROMPT 20 (renderTimeline), PROMPT 22 (record pages).
Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIMELINE IMPLEMENTATION (complete renderTimeline from PROMPT 20)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TimelineItem:
id: string
timestamp: string (ISO)
entityType: string
entityId: string
eventType: 'communication' | 'task_created' | 'task_completed' | 'stage_changed' |
'note_added' | 'file_attached' | 'field_updated' | 'ai_action' |
'record_created' | 'custom'
title: string
body?: string
icon: string (use existing icons.ts icons)
actor?: string (user or 'AI' if aiGenerated)
metadata?: Record<string, unknown> (e.g. oldValue/newValue for field_updated)

buildTimeline(entityType: string, entityId: string, state: AppState): TimelineItem[]
— Aggregates from: communications (linked by clientId/dealId/projectId),
audit log (filtered by entityType + entityId), tasks (linked by projectId or clientId).
— Sorts descending by timestamp.
— Returns max 100 items; "Load more" button for pagination.

renderTimeline(items: TimelineItem[]): string
— Vertical timeline with left-side icon/dot, right-side content.
— Icon color matches eventType (communication=blue, task=green, ai=violet, etc.)
— field_updated items show old → new value in a compact diff format.
— ai_action items show AI badge.
— Grouped by date (day headers).
— Each item: "Show more" if body > 120 chars.

bindTimeline(containerId: string): void
— "Load more" button handler.
— Clicking a timeline item linked to a record opens that record page/modal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RELATIONSHIP GRAPH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/ui/relationship-graph.ts

Implement a lightweight SVG-based relationship graph.
No external graph library — implement force-directed layout in ~100 lines of vanilla JS.

GraphNode: { id: string; type: string; label: string; x: number; y: number }
GraphEdge: { from: string; to: string; label: string }

buildRelationshipGraph(entityType: string, entityId: string, state: AppState,
depth: number = 2): { nodes: GraphNode[]; edges: GraphEdge[] }
— Walks relationships outward from the root entity up to `depth` hops:
Client → linked People, Projects, Deals, Communications (recent 5)
Project → Client, Tasks (open only), Files
Deal → Client, Person, linked Projects, Tasks
Person → Client, linked Deals
— Caps total nodes at 30 to keep the graph readable.

renderRelationshipGraph(graph): string
— Renders an SVG element (viewBox, no fixed width — responsive).
— Each node: circle with entity-type color, label below.
— Root node: larger circle.
— Edges: lines with label in small text at midpoint.
— Simple spring layout: position nodes with repulsion + edge attraction.
Run 50 iterations synchronously (fast enough for 30 nodes).

bindRelationshipGraph(containerId: string): void
— Click on a non-root node → navigate to that record page.
— Hover on a node → show tooltip with type + label.
— "Expand" button on nodes at depth limit → rebuild graph centered on that node.

Add the Relationship Graph as a collapsible section on all Record 360 pages (PROMPT 22).
Default closed on first view; state persisted in localStorage per record type.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI GRAPH EXPLANATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Below the graph: "Why is this relevant?" button.
If AI ready: sends graph node list (types + IDs only, no content) to AI.
Prompt: "Explain in one paragraph why these records are related and what their current
combined status suggests about [root entity label]."
Renders result in a panel beneath the graph.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Timeline renders on Client 360 page with communications and audit events
□ field_updated events show old/new value diff
□ Relationship graph renders for a client with linked projects and people
□ Clicking a node navigates to that record
□ SVG is responsive (scales to container width)
□ "Why is this relevant?" AI explanation renders when AI is ready
PROMPT 26 — Reports as Narrative Briefs

You are implementing Reports as Narrative Briefs in the Task App CRM monorepo
(d:\techkeycrmapp), per the redesign strategy in
docs/reports/2026-05-21-ui-redesign/FUTURE-UI-REDESIGN-STRATEGY.md.

Depends on: PROMPT 20 (tokens), PROMPT 4 (forecasting), PROMPT 5 (lead scoring).
Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REPORTS VIEW REDESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The existing reports view becomes a "Reports Library" — a list of available report
types that each render as an interactive narrative brief.

Report types:

1. Weekly Operations Brief
2. Client Health Report
3. Project Risk Report
4. Workload Report
5. Time Utilization Report
6. Data Quality Report

Each report shares a common shell:
Header: report title, generated timestamp, period selector, "Export" button menu
Body: summary + sections + drilldowns + "Create tasks from findings" button
Footer: evidence links (records contributing to the findings)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLAIN-ENGLISH AI SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each report begins with an AI-generated plain-English summary section (if AI ready).
The summary is generated from purely numeric/aggregate inputs (never raw content).
Cached 4h per report type in localStorage.

Example for Weekly Operations Brief:
Prompt: "You are a business analyst. Here is this week's operational data:
[stats: X overdue tasks, Y stale deals, Z projects near deadline,
N communications this week]. Write a 3-sentence executive summary.
Be specific, use the exact numbers, identify the single most urgent issue."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA QUALITY REPORT (key new report)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

computeDataQualityReport(state: AppState): DataQualityReport
Checks: - Clients missing: email, phone, department - People missing: email, linked client - Deals missing: value, closeDate, assigned person - Projects missing: deadline, linked client - Tasks missing: dueDate, linked project - Duplicate candidates count (from duplicateDetector, PROMPT 8) - Communications with no outcome logged - Time entries unlinked to a project
Returns: { entityType, issueType, count, affectedIds[], severity }[]

Renders as:
A health scorecard (0-100, A-F grade) per entity type.
Issues listed with severity badges and affected record count.
"Fix now" button per issue type → opens a filtered list of affected records.
"Create cleanup task" button → uses PROMPT 6 'Data Cleanup Assistant' agent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each report has export options:
CSV — raw data tables.
JSON — full structured report object.
Markdown — rendered narrative as plain text (for pasting into emails/docs).
Print / Save PDF — use window.print() with a print-specific CSS stylesheet.
Print stylesheet: hide sidebar, topbar, action buttons; show report content only.

All exports: PHI-classified fields redacted per HIPAA rules (PROMPT 16) with
confirmation modal if HIPAA active.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TASKS FROM FINDINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every report section with actionable findings has a "Create tasks from findings" button.
Clicking it opens a checklist modal:
Each finding → pre-generated task title (e.g. "Fix missing email on 3 clients").
User checks which ones to create.
Bulk-creates checked tasks via dbCreate('tasks', ...) with linked entities.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Reports Library lists all 6 report types
□ Data Quality Report computes and renders correctly
□ AI summary appears at top of each report when AI is ready
□ "Fix now" button for missing data opens filtered entity list
□ Export to Markdown generates readable report text
□ Print stylesheet hides UI chrome and shows only report content
□ "Create tasks from findings" bulk-creates checked tasks
PROMPT 27 — Phase 4: Backend-Ready Agent Layer

You are implementing the Backend-Ready Agent Layer in the Task App CRM monorepo
(d:\techkeycrmapp). This is Phase 4 of the redesign strategy in
docs/reports/2026-05-21-ui-redesign/FUTURE-UI-REDESIGN-STRATEGY.md.

Depends on: PROMPT 23 (AI Workbench / Agent Builder), PROMPT 6 (automation engine).
Read CLAUDE.md fully before starting. This phase makes the agent system production-ready.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAPABILITY REGISTRY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/ai/capability-registry.ts

AgentCapability:
id: string
name: string
description: string
requiredPermission: 'read' | 'draft' | 'write' | 'admin'
affectsEntities: string[] (entity type names)
requiresHumanApproval: boolean
isDestructive: boolean
euAiActScope: 'minimal-risk' | 'limited-risk'

CAPABILITY_REGISTRY: AgentCapability[] = [
{ id: 'read_records', name: 'Read CRM Records', requiredPermission: 'read', ... },
{ id: 'create_task', name: 'Create Task', requiredPermission: 'write',
requiresHumanApproval: false, isDestructive: false, ... },
{ id: 'update_deal_stage', name: 'Move Deal Stage', requiredPermission: 'write',
requiresHumanApproval: true, isDestructive: false,
euAiActScope: 'limited-risk', ... },
{ id: 'delete_record', name: 'Delete Record', requiredPermission: 'admin',
requiresHumanApproval: true, isDestructive: true, ... },
{ id: 'send_email_draft', name: 'Draft Email', requiredPermission: 'draft',
requiresHumanApproval: true, isDestructive: false, ... },
... (one entry per ActionType in AutomationRuleSchema)
]

Agents declare their capabilities by listing capability IDs.
The capability registry is shown in AI Workbench > Memory & Context tab (PROMPT 23).
Before executing any agent action: check the capability is declared; throw if not.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGENT RUN MODEL (extend PROMPT 23)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Extend AgentRun (from PROMPT 23) with:
capabilities: string[] (capability IDs used in this run)
approvalCheckpoints: { stepIndex: number; requiredCapability: string;
approvedAt?: string; rejectedAt?: string }[]
maxRunDurationMs: number (default 30000; kill run if exceeded)
runTimeoutFired: boolean

In rule-engine.ts: wrap every rule execution in a run timeout:
const timeout = setTimeout(() => { /_ cancel run, write failed AgentRun _/ }, maxRunDurationMs)
On completion: clearTimeout(timeout).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POLICY-AWARE APPROVAL WORKFLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/ai/approval-engine.ts

ApprovalPolicy: 'auto-approve' | 'require-approval' | 'block'

getApprovalPolicy(capability: AgentCapability, context: AppState): ApprovalPolicy
— block: if capability.isDestructive and no admin permission configured
— require-approval: if capability.requiresHumanApproval or euAiActScope='limited-risk'
— auto-approve: read-only capabilities, or user has explicitly set auto-approve
for this capability (stored in settings, localStorage 'taskapp_agent_policies_v1')

User can configure per-capability policies in AI Workbench > Agents settings:
Each capability: "Always require approval" | "Auto-approve" | "Block"
Default: require-approval for all write/admin capabilities.
Auto-approve only available for non-destructive capabilities.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVER SYNC SUPPORT FOR ENTERPRISE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to server/src/services/agent-runs.ts:
CRUD for AgentRun records, with tenant isolation (withTenant).
Write audit event on every run start, completion, approval, rejection.

Add to server/src/api/routes/agent-runs.ts:
GET /api/v1/agent-runs — list with filters (agentName, status, date range)
GET /api/v1/agent-runs/:id — single run details
POST /api/v1/agent-runs/:id/approve — approve a pending approval checkpoint
POST /api/v1/agent-runs/:id/reject — reject a pending checkpoint

Generate migration: pnpm --filter server db:generate

In pwa-sync and enterprise builds: sync agent runs to server so approval requests
can be acted on from any device.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline, pnpm --filter server typecheck pass
□ Capability registry lists all capabilities in Memory & Context tab
□ Agent cannot execute undeclared capability (throws + writes failed AgentRun)
□ Run timeout fires for a stubbed long-running rule (testable with > maxRunDurationMs)
□ Per-capability approval policies persist and are enforced
□ Auto-approve setting allows non-destructive actions without confirmation
□ Server: GET /api/v1/agent-runs returns correct tenant-scoped results
PROMPT 28 — Phase 5: Advanced Intelligence

You are implementing Phase 5 Advanced Intelligence features in the Task App CRM
monorepo (d:\techkeycrmapp), per the redesign strategy in
docs/reports/2026-05-21-ui-redesign/FUTURE-UI-REDESIGN-STRATEGY.md.

Depends on: PROMPT 7 (agent loop), PROMPT 23 (AI workbench), PROMPT 27 (capability registry).
Read CLAUDE.md fully before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEMANTIC SEARCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/ai/semantic-search.ts

For the offline-web build (browser AI only), use the existing AI backend
to embed and compare concepts — not true vector search, but AI-powered relevance ranking.

semanticSearch(query: string, entityTypes: string[], state: AppState):
Promise<{ entityType: string; id: string; title: string; relevanceScore: number; snippet: string }[]>

Implementation for browser-ai profile (window.LanguageModel available):
For each entity type in scope:
Build a searchable text snippet per record (title + notes + key fields, max 200 chars).
Send a ranking prompt to AI: "Rate the relevance of each record to the query '[query]'
on a scale 0-10. Records: [list]. Return JSON: [{id, score}]."
Map scores to results, filter score ≥ 5, sort desc.
Cap total records sent to AI at 20 per entity type to stay within context limits.

Fallback (AI unavailable): use existing fuzzy search from command palette (PROMPT 24).

Add "Semantic search" toggle to command palette (PROMPT 24):
When enabled, search results are reranked by AI relevance.
Toggle stored in localStorage 'taskapp_semantic_search_v1'.
Show "✦ AI-ranked" badge in palette when active.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENTITY RESOLUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: packages/core/src/ai/entity-resolver.ts

Entity resolution = disambiguating references in natural language.
Used by AI tools (ai-tools.ts) when the AI says "create a task for Acme"
and there are multiple Acme-like clients.

resolveEntity(mention: string, entityType: string, state: AppState):
Promise<{ candidates: { id: string; label: string; score: number }[]; resolved?: string }>

Process:

1. Fuzzy search mention against entity names (score with Jaro-Winkler from PROMPT 8).
2. If one candidate scores ≥ 90: auto-resolve (return resolved = id).
3. If 2-4 candidates score 50-89: return candidates list, let caller prompt user.
4. If no candidates: return empty.

Wire into ai-tools.ts: before creating/updating a record, call resolveEntity for any
entity reference. If ambiguous, pause tool execution and ask the user:
"Did you mean [Option A] or [Option B]?" — renders as a selection prompt in the chat.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROACTIVE MONITORING (extend agent loop)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add two new checks to runAgentCycle() (PROMPT 7):

CHECK 6 — Anomaly Detection
Compute rolling 7-day averages for: communications per day, tasks created per day,
deals moved per week. Store these baselines in localStorage.
If today's values are > 2x or < 0.5x the 7-day average: emit 'anomaly_detected' insight.
Prompt AI (if ready): "Activity anomaly detected: [description]. Is this a concern or
expected? Respond in one sentence."

CHECK 7 — Goal Progress Monitoring
Allow users to define simple goals in Settings > Goals:
"Log at least 5 communications per week"
"Close at least 1 deal per month"
"Complete all overdue tasks by [date]"
Goal schema: { id, description, metric, target, period, currentValue }
Stored in localStorage 'taskapp_goals_v1'.
Agent checks goal progress; emits 'goal_at_risk' insight if < 50% progress at 70%
of the period elapsed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MULTIMODAL DOCUMENT UNDERSTANDING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Extend document management to support file content understanding.

For text files and pasted content (already handled): existing AI summarization.

For PDF files (if user uploads via file store):
Use PDF.js (already a browser-native option via import — check if it is available,
do not add if not already in the bundle) to extract text from the first 10 pages.
If text extraction succeeds: pass to AI summarization (existing flow in agent loop).
If PDF.js is not in bundle: show "PDF text extraction requires PDF.js —
paste the text manually instead."

For images (if user attaches an image file):
In enterprise/pwa builds with cloud AI enabled: use the AI provider's vision API
to describe the image. Store description as the file's aiSummary field.
In offline-web builds: skip — show "Image analysis requires cloud AI."
Never send images to browser built-in AI (not supported by window.LanguageModel).

Add 'aiSummary' field to FileSchema (packages/core/src/schemas/file.schema.ts).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY & COMPLIANCE (all Phase 5 features)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Semantic search: records are sent to AI as snippets — strip hipaaClassified fields
  before building snippets (use stripPhiForAi from PROMPT 16).
- Anomaly baselines stored in localStorage (no PII — only numeric aggregates).
- Goal monitoring: goal descriptions are user-input; sanitize with sanitize.ts before storing.
- PDF text extraction: extracted text is sent to AI — apply same PHI stripping.
- Image analysis for enterprise: show explicit consent prompt before first image analysis.
  "This image will be sent to [provider] for analysis. Proceed?"
- Write 'ai_decision' audit events (PROMPT 17) for all AI calls.

ACCEPTANCE CRITERIA:
□ pnpm run typecheck passes; pnpm run build:offline succeeds
□ Semantic search toggle in command palette reranks results visibly
□ Entity resolution: ambiguous mention shows disambiguation prompt in AI chat
□ Anomaly detection emits insight when today's activity is 2x the 7-day average
□ Goal progress insight fires when goal is behind schedule
□ PDF text extraction (if PDF.js available) populates document aiSummary
□ Image analysis blocked in offline-web build with clear message
□ PHI stripping applied before all AI calls in this prompt
Full Prompt Index (Prompts 1–28)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPLETE IMPLEMENTATION SEQUENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PHASE A — FOUNDATION
P1 Vertical Profiles + Custom Fields
P2 Deals Entity + Pipeline Schema ← P1

PHASE B — CORE CRM FEATURES
P3 Pipeline / Kanban View ← P1, P2
P4 Sales Forecasting Dashboard ← P2, P3
P5 Lead Scoring Engine ← P1, P2
P6 Workflow Automation Rule Engine ← P1, P2

PHASE C — AI INTEGRATION
P7 Agentic AI Agent Loop ← P5, P6
P8 Duplicate Detection ← P7

PHASE D — DATA MANAGEMENT & INPUT
P9 Voice Input
P10 CSV Bulk Import ← P1, P8
P11 Omnichannel Communications Log ← P1
P12 Email Integration — Offline AI ← P7, P11
P13 Email Integration — Server OAuth2 ← P11

PHASE E — PLATFORM BUILDS
P14 Mobile (Capacitor) Full Implementation ← all P1–P12 complete
P15 Dataverse Adapter Completion ← P2

PHASE F — COMPLIANCE
P16 HIPAA Compliance ← P1, P7, P9, P10
P17 EU AI Act Compliance ← P5, P6, P7
P18 SOC 2 Type II ← P6, P7
P19 CCPA Compliance ← P16

PHASE G — UI REDESIGN FOUNDATION
P20 Design Token System + Component Library

PHASE H — UI REDESIGN CORE SCREENS
P21 Command Center ← P20, P5, P7, P6
P22 Record 360 Pages ← P20
P23 AI Workbench ← P20, P6, P7
P24 Universal Command Palette Upgrade ← P20, P23
P25 Relationship Graph + Timeline ← P20, P22

PHASE I — UI REDESIGN ADVANCED
P26 Reports as Narrative Briefs ← P20, P4, P5
P27 Backend-Ready Agent Layer ← P23, P6
P28 Phase 5: Advanced Intelligence ← P7, P23, P27

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Run P1–P19 first; P20 can start in parallel with P14–P19
- One prompt = one feature branch = one PR
- After each PR: pnpm run typecheck + pnpm run build:offline must pass
- After any prompt that changes CLAUDE.md facts: update
  CLAUDE.md, TECHNICAL-REFERENCE.md, CHANGELOG.md
- When you are ready to start: say "go" and specify which prompt number
