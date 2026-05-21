# Future UI Redesign Strategy

Assessment date: 2026-05-21

## Executive Summary

The next version of Task App CRM should move from a “screens and tables” CRM to an **intent-driven workbench**: a fast offline CRM where users can still inspect and edit every record manually, but the primary experience helps them answer “what needs my attention, what should happen next, and can the system do the busywork safely?”

The strongest product direction is **not** a full-screen chatbot. The best 2026-and-beyond pattern is an **AI work layer embedded into every CRM surface**:

- A command center that shows priorities, risks, agent runs, and next best actions.
- Record pages that summarize context, history, relationships, and recommended next steps.
- AI actions that are visible, reviewable, undoable, and permission-aware.
- Configurable assistants/agents for recurring workflows.
- Dense, calm, keyboard-friendly layouts for real work.

This aligns with current market direction. IBM describes 2026 enterprise AI as shifting toward orchestration, agent control planes, workflow-level agents, and human validation checkpoints. Salesforce and HubSpot are pushing CRM AI into existing work surfaces with permission-aware data access, record summaries, custom agents, and approval before CRM writes. Research on human-in-the-loop agentic systems emphasizes co-planning, action guards, memory, and explicit oversight.

## Current UI Assessment

Current strengths:

- Clear core surfaces: dashboard, CRM object views, AI chat, settings, reports, calendar, library.
- Multiple view modes: list, grid, kanban, spatial canvas.
- Offline-first constraints are respected: system fonts, no external visual assets, no marketing layout.
- Existing AI chat has human approval for mutating actions.
- Sidebar and topbar provide familiar SaaS navigation.
- Mobile bottom tabs and sheet navigation exist.

Current friction:

- The dashboard behaves like a movable card board. That is flexible, but it does not yet feel like a decision cockpit.
- AI is mostly a destination/panel, not a pervasive work layer.
- Views are record-centric instead of outcome-centric. Users still have to hunt for “what matters now.”
- Record relationships are present in data but not elevated enough visually.
- The UI relies heavily on many small cards and inline styles, making hierarchy harder to tune consistently.
- Current color language is slate/indigo dominant. It is professional, but the product could feel more distinctive and less generic.
- Accessibility evidence shows many focus, modal, and screen-reader expectations still need active browser verification.

## Product North Star

**Task App CRM should feel like an offline-first AI operations desk for client work.**

User promise:

> “Open the app and immediately know what changed, what matters, what is blocked, what to do next, and what the AI can safely handle for me.”

Design principles:

1. **Work first, AI second.** AI should reduce CRM chores, not become another place to manage.
2. **Explain before acting.** Every AI recommendation should show why it appears, what data it used, and what will change.
3. **Manual always works.** Every AI-supported action must have a deterministic UI path.
4. **Dense but calm.** CRM users want scanning, comparison, and repeated action, not decorative dashboards.
5. **Make relationships visible.** Clients, projects, people, tasks, files, notes, communications, and time should feel connected.
6. **Offline confidence.** Sync/storage/security state should be obvious without being noisy.
7. **Accessible by default.** Keyboard, focus, contrast, and screen reader semantics are product requirements, not polish.

## Recommended Information Architecture

Replace the current nav emphasis with work modes:

| Mode           | Purpose                                                    | Current mappings                  |
| -------------- | ---------------------------------------------------------- | --------------------------------- |
| Command Center | Today, priorities, risks, agent runs, follow-ups, workload | Dashboard, notifications, reports |
| Work           | Tasks, projects, calendar, time                            | Tasks, Projects, Calendar, Time   |
| Relationships  | Clients, people, departments                               | Clients, People, Departments      |
| Knowledge      | Documents, files, notes, communications                    | Library, Notes, Communications    |
| Intelligence   | AI chat, agents, automations, insights, model setup        | AI Chat, Settings AI              |
| System         | Security, storage, sync, import/export, audit              | Settings, Trash                   |

Desktop layout:

- Left rail: compact primary modes with icons and labels.
- Topbar: command search, current object context, sync/security state, notification/AI status.
- Main canvas: selected workspace.
- Right rail: contextual assistant and record insights, collapsible.

Mobile layout:

- Bottom tabs: Home, Work, Relationships, Knowledge, More.
- Floating command button: search/ask/create.
- AI appears as a bottom sheet, not a side panel.
- Record actions should be thumb-reachable.

## Redesigned Core Screens

### 1. Command Center

Replace the movable dashboard with a structured operating cockpit.

Sections:

- **Now:** overdue work, due today, waiting on client, unassigned items, unsaved/offline issues.
- **Next best actions:** AI-generated but deterministic-looking recommendations with reasons.
- **Agent activity:** running/completed agent tasks, approval requests, blocked runs.
- **Pipeline pulse:** client/project stage movement, stale deals/projects, risk flags.
- **Team load:** assignment distribution and overload warnings.
- **Recent changes:** communications, file changes, notes, completed tasks.

UX behavior:

- Everything is actionable.
- Each recommendation has “why this?” and “preview action.”
- Users can dismiss, snooze, assign, or ask AI to prepare the action.

Example recommendation card:

```text
Client follow-up risk
Acme Corp has 2 open projects and no communication in 14 days.

Evidence: last email Mar 7, Project Alpha due in 5 days.

[Draft follow-up] [Snooze] [Open client]
```

### 2. Record 360 Page

The current modal should evolve into a full record page or large split pane for important objects.

Layout:

- Header: name/title, status, owner, priority, security/sync indicators.
- Left/main: details, notes, timeline, files, communications.
- Right: AI summary, risks, relationships, next actions, activity stats.
- Bottom/action bar: create task, log communication, attach file, start timer, ask AI.

For clients:

- Health score
- Open projects
- Last touch
- Active people
- Revenue/value fields if added later
- AI-generated account brief
- Suggested next outreach

For projects:

- Stage, deadline, owner, linked client
- Task breakdown
- Timeline/progress
- Blockers
- Decision log
- Files/docs
- AI project brief and risk forecast

For tasks:

- Clear status, due date, assignee, project/client context
- Time tracking summary
- Dependencies/subtasks
- AI “finish plan” and estimated next steps

### 3. AI Workbench

Replace “AI Chat” as a generic page with an **AI Workbench**.

Tabs:

- **Ask:** conversational assistant for ad hoc questions.
- **Actions:** pending approvals and proposed CRM changes.
- **Agents:** reusable automations and assistants.
- **Memory & Context:** what the AI can access, recent context, knowledge sources.
- **Runs:** history of agent runs, results, errors, and audit events.

Key UI patterns:

- Tool/action cards instead of raw chat JSON.
- Plan preview for multi-step tasks.
- Approval tiers: auto-read, draft-only, approval-required, blocked.
- “Used these records” disclosure.
- Undo or restore route for every low-risk mutation.
- No hidden autonomous work.

### 4. Agent Builder Lite

Inspired by HubSpot Breeze Studio and Salesforce Agentforce, add a simple local/offline agent builder.

Initial agents:

- Follow-up Assistant
- Project Risk Scout
- Meeting Notes Summarizer
- Weekly Planner
- Data Cleanup Assistant
- Import Mapper
- Time Entry Reconciler

Builder fields:

- Name
- Purpose
- Records it can read
- Tools it can use
- Whether writes require approval
- Trigger: manual, on open, scheduled, record change, import complete
- Output: draft, task, note, communication, report

This should begin as deterministic templates plus AI drafting. Full autonomy should wait until backend authorization, audit, and run queues exist.

### 5. Universal Command Palette

The command palette should become the fastest way to work.

Capabilities:

- Search records.
- Create any record.
- Run commands.
- Ask AI.
- Start agent.
- Jump to recent views.
- Execute safe transformations like “show overdue tasks for Acme.”

Design:

- Single input.
- Segmented result types: Records, Commands, AI, Agents.
- Keyboard-first.
- Recent/frequent actions.
- Works offline.

### 6. Relationship Graph and Timeline

The app already has related objects; the redesigned UI should make them obvious.

Add:

- Relationship graph for client/project/person/task/file/doc links.
- Timeline for each record: notes, communications, status changes, files, tasks, time.
- “Why is this relevant?” AI explanations based on graph context.

### 7. Reports as Narrative Briefs

Reports should become interactive briefings, not just charts.

Views:

- Weekly operations brief
- Client health report
- Project risk report
- Workload report
- Time utilization
- Data quality report

Each report should support:

- Plain-English summary
- Drilldown
- Export to PDF/Word/CSV
- “Create tasks from findings”
- Evidence links back to records

## Visual Design Direction

Recommended style:

- Quiet, high-density operational UI.
- More neutral surfaces with a richer semantic palette:
  - Blue for information
  - Green for healthy/complete
  - Amber for attention
  - Red for risk
  - Violet/teal accent only for AI/intelligence
- 8px radius for most components.
- Fewer floating cards; more structured panels and split panes.
- Stronger table/list density controls: comfortable, compact, spacious.
- Sticky action bars for records.
- Clear focus rings and visible keyboard states.

Avoid:

- Giant hero sections.
- Decorative AI gradients/orbs.
- “Chatbot as product” designs.
- Too many nested cards.
- Hiding real data behind summaries.

## AI Interaction Model

The redesigned AI should have five modes:

1. **Answer:** summarize or explain CRM state.
2. **Draft:** prepare an email, note, task list, or report.
3. **Recommend:** suggest next actions with evidence.
4. **Act with approval:** create/update/delete after explicit confirmation.
5. **Monitor:** watch for conditions and create recommendations.

Every AI output should include:

- Confidence or certainty language where useful.
- Evidence records used.
- Proposed action preview.
- Data boundary: local/browser/internal/cloud.
- Permissions required.
- Audit trail.

## Phased Roadmap

### Phase 1: UI Foundation

- Create design tokens and shared components.
- Replace inline styles in core views gradually.
- Add split-pane record layout.
- Improve command palette.
- Add density modes.
- Fix modal focus traps and accessibility basics.

### Phase 2: Command Center

- Replace dashboard layout with Command Center.
- Add recommendation cards.
- Add “why this?” evidence drawers.
- Add timeline and relationship summaries.

### Phase 3: AI Workbench

- Convert AI Chat into Ask/Actions/Agents/Runs.
- Add action cards and plan previews.
- Add agent templates.
- Add run history stored locally.

### Phase 4: Backend-Ready Agent Layer

- Add capability registry.
- Add agent run model.
- Add policy-aware approval workflow.
- Add server sync support for enterprise.

### Phase 5: Advanced Intelligence

- Semantic search.
- Entity resolution.
- Proactive monitoring.
- Cross-channel work: email/calendar/file integrations.
- Multimodal document/file understanding.

## Success Metrics

Product metrics:

- Time to create a client/project/task.
- Time to answer “what needs attention today?”
- % of recommendations accepted, dismissed, snoozed.
- Manual data-entry reduction.
- Search success rate.
- AI action approval rate.
- Undo/restore rate.

Quality metrics:

- WCAG 2.2 AA pass rate.
- Keyboard task completion.
- Offline startup time.
- Bundle size.
- Record load/render latency.
- AI response time by tier.

Trust metrics:

- % AI actions with evidence links.
- % AI writes requiring approval.
- Audit log completeness.
- User-reported incorrect recommendations.
- Agent failure and cancellation rate.

## Competitive Differentiation

Most CRMs are moving toward cloud AI agents. Task App CRM can stand apart by being:

- **Offline-first and private by default.**
- **AI-native without forcing cloud AI.**
- **Human-approved for all meaningful writes.**
- **Simple enough for small teams, structured enough for enterprise.**
- **Portable: one app, local vault, optional sync/enterprise path.**

The future-facing pitch:

> “A private AI CRM that works like an operations desk: see what matters, understand why, and let trusted local agents prepare the work while you stay in control.”
