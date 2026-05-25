# Frontend Completion Prompt — Task App CRM

## What You Are Doing

You are completing the frontend of **Task App CRM**, a TypeScript monorepo at `d:\techkeycrmapp`. The core CRM entities (Clients, Projects, Tasks, People, Documents) are fully implemented. Your job is to implement the missing entities, fix orphaned data stores, complete the AI conversation management, fix all accessibility debt, and add missing CRUD operations.

Get the current date before starting. Use 2026 production-ready best practices throughout. Do not take shortcuts or leave anything partial.

---

## Read These Files First — Required Before Writing Any Code

Read every one of these files in full before touching anything:

- `CLAUDE.md` — full architecture reference, security rules, module dependency order
- `packages/core/src/constants.ts` — STORES, IDB_STORES, TASK_STATUSES, TAG_COLORS, COMM_TYPES
- `packages/core/src/state.ts` — full AppState shape
- `packages/core/src/storage/db.ts` — all database helper functions
- `packages/core/src/main.ts` — full import order, hook wiring pattern
- `packages/core/src/schemas/index.ts` — existing schemas
- `packages/core/src/schemas/client.schema.ts` — schema pattern to follow
- `packages/core/src/schemas/task.schema.ts` — schema pattern to follow
- `packages/core/src/schemas/document.schema.ts` — current schema (incomplete — you will extend it)
- `packages/core/src/views/workspace.ts` — how views are registered and rendered
- `packages/core/src/views/record-modal.ts` — form field definitions and modal pattern
- `packages/core/src/views/settings.ts` — settings view (you will extend)
- `packages/core/src/views/time-tracker.ts` — time entries view (you will extend)
- `packages/core/src/views/sidebar.ts` — sidebar (you will extend)
- `packages/core/src/ui/components.ts` — shared components (confirm dialog, toast, command palette)
- `packages/core/src/ai/ai-ui.ts` — AI chat panel (you will significantly extend)
- `packages/core/src/ai/ai-runtime.ts` — AI runtime state object
- `packages/core/src/ai/ai-prefs.ts` — AI preferences
- `packages/core/src/views/library.ts` — documents/files view pattern
- `packages/core/src/views/dashboard.ts` — dashboard cards pattern
- `packages/core/src/security/sanitize.ts` — DOMPurify wrapper
- `packages/core/src/utils.ts` — escH(), all utility functions

---

## Architecture Rules — Non-Negotiable

1. **All user-visible strings must go through `escH()` from `utils.ts` before `innerHTML` interpolation.** No exceptions.
2. **Every new view must follow the render/bind pattern** — `renderFoo(state): string` and `bindFoo(state?): void`.
3. **Hook injection pattern for circular import avoidance** — views that need `appRenderWorkspace` receive it via a `setFooHooks()` setter, called once in `main.ts` before first render.
4. **New IDB-backed stores** (large content like conversation messages) must go through `_idbPutRecord`/`_idbLoadStore` — not `dbFlush`. Add to `IDB_STORES` in `constants.ts`.
5. **New CRM stores** (small structured records) go through `dbCreate`/`dbUpdate`/`dbDelete` — they are flushed as the encrypted vault blob. Add to `STORES` in `constants.ts`.
6. **`security/trusted-types.ts` must remain the first import in `main.ts`** — do not change import order above it.
7. **No new `trustedTypes.createPolicy()` calls** — the two existing policies cover all cases.
8. **State changes**: use `setState(patch)` from `state.ts`, never mutate state directly.
9. **TypeScript strict** — no `any`, use the existing type patterns.
10. Do not edit `taskapp.html` — legacy only.
11. Do not edit files in `server/` — that is the backend package.

---

## Task 1: Add Missing Constants

In `packages/core/src/constants.ts`, add:

- `'communications'` to the `STORES` array (it is already listed but verify)
- `'conversations'` to the `IDB_STORES` array (each conversation is stored as an individual IDB record)
- Export `COMM_TYPES` if not already exported: `export const COMM_TYPES = ['call', 'email', 'meeting', 'note'] as const`
- Export `NOTIFICATION_TYPES`: `export const NOTIFICATION_TYPES = ['info', 'warning', 'due_soon', 'overdue', 'mention'] as const`

---

## Task 2: Create Missing Schema Files

Follow the exact pattern in `packages/core/src/schemas/client.schema.ts`. Use `valibot` (`v`) for all schemas. Every schema must export: the schema object, a TypeScript `type` inference, and an `id` string constant.

**`packages/core/src/schemas/communication.schema.ts`**

```ts
// Fields: id (uuid), createdAt, updatedAt, type (picklist: COMM_TYPES),
// subject (string, minLength 1), body (optional string), occurredAt (string ISO8601),
// durationMinutes (optional number), relatedStore (optional string),
// relatedId (optional string), personId (optional string), clientId (optional string)
```

**`packages/core/src/schemas/tag.schema.ts`**

```ts
// Fields: id (uuid), createdAt, updatedAt, name (string minLength 1),
// color (string — hex color e.g. '#3b82f6')
```

**`packages/core/src/schemas/time-entry.schema.ts`**

```ts
// Fields: id (uuid), createdAt, updatedAt, taskId (optional string),
// description (optional string), startedAt (string ISO8601),
// endedAt (optional string ISO8601 — null means running),
// durationSeconds (optional number — computed when stopped)
```

**`packages/core/src/schemas/notification.schema.ts`**

```ts
// Fields: id (uuid), createdAt, updatedAt, title (string minLength 1),
// body (optional string), type (picklist: NOTIFICATION_TYPES),
// relatedStore (optional string), relatedId (optional string), read (boolean default false)
```

**`packages/core/src/schemas/department.schema.ts`**

```ts
// Fields: id (uuid), createdAt, updatedAt, name (string minLength 1),
// description (optional string)
```

**`packages/core/src/schemas/conversation.schema.ts`**

```ts
// Fields: id (uuid), createdAt, updatedAt, title (string default 'New Conversation'),
// model (optional string — which AI model was used),
// messages (array of { role: 'user'|'assistant', content: string, timestamp: string })
```

**Update `packages/core/src/schemas/document.schema.ts`**
Add these missing fields that the UI already uses but are absent from the schema:

- `excerpt` (optional string — first 200 chars of body, auto-generated on save)
- `linkedStore` (optional string — which entity type this document is attached to)
- `linkedId` (optional string — the entity id)
- `section` (optional string — grouping label in library)
- `pinned` (optional boolean, default false)
- `createdBy` (optional string — 'ai' if AI-generated, userId if user-created)
- `tagIds` (optional array of strings — tag ids)

**Update `packages/core/src/schemas/index.ts`**
Export all new and updated schemas from the index.

---

## Task 3: Update AppState in `packages/core/src/state.ts`

Add these fields to the `AppState` interface and initialize them in `getInitialState()`:

- `communications: Communication[]` — initialize `[]`
- `conversations: Conversation[]` — initialize `[]`
- `activeConversationId: string | null` — initialize `null`

Also add `reloadData()` support for `communications` (already in STORES — just needs wiring in `reloadData()` if missing).
For `conversations`: load from IDB using the existing `_idbLoadStore('conversations')` pattern.

---

## Task 4: Create the Communications View

**File: `packages/core/src/views/communications.ts`**

This is an activity log view — calls, emails, meetings, notes linked to clients/people/projects.

Implement following the standard render/bind pattern:

**`renderCommunications(state: AppState): string`**

- Renders a list/table of all communications sorted by `occurredAt` descending
- Each row shows: type icon (phone/email/calendar/note), subject, related entity name (resolved from clientId or relatedStore+relatedId), occurred date, duration (if call/meeting), created by
- Include a "Log Activity" button that opens the record modal for communications
- Include filter buttons: All | Calls | Emails | Meetings | Notes
- Empty state: "No activity logged yet — use Log Activity to record calls, emails, and meetings."

**`bindCommunications(state?: AppState): void`**

- Wire "Log Activity" button to open the record modal for a new communication
- Wire filter buttons to filter the list client-side
- Wire each row's edit/delete actions

**`setCommunicationsHooks(appRenderWorkspace: (v: string) => void): void`**

- Standard hook setter

Add communications to `packages/core/src/views/workspace.ts` — register it in `WS_META` with label "Communications", icon (use `Icons.Phone` or similar), and view key `'communications'`.

Add `'communications'` to the `currentView` union in `state.ts` and to the sidebar nav in `packages/core/src/views/sidebar.ts`.

Add communications to the record modal in `packages/core/src/views/record-modal.ts`:

- Fields: type (select: Call|Email|Meeting|Note), subject (text, required), body (textarea), occurredAt (datetime-local, required, default now), durationMinutes (number, shown only for Call/Meeting types), relatedStore (hidden, pre-set from context if opened from a client/project/person record), relatedId (hidden), personId (select from people), clientId (select from clients)

---

## Task 5: Complete the AI Conversation Management

The AI view (`packages/core/src/ai/ai-ui.ts`) currently has a single running chat with no persistence. Implement full conversation management like ChatGPT/Claude.

### 5a. Conversation Data Model

Conversations are stored in IDB (`conversations` store — `IDB_STORES`). Each conversation record matches the `Conversation` schema from Task 2. The `messages` array holds the full chat history.

On app init (in `main.ts`), load all conversations from IDB into `state.conversations`. Set `state.activeConversationId` to the most recently updated conversation, or `null` if none exist.

### 5b. Update `packages/core/src/ai/ai-runtime.ts`

Add to `aiRuntime` object:

- `conversationId: string | null` — the active conversation IDB record id
- `savedMessageCount: number` — track how many messages have been saved (for delta saves)

Add functions:

- `setActiveConversation(id: string | null): void` — updates `aiRuntime.conversationId`, loads history from the matching conversation in state into `aiRuntime.history`
- `saveConversationMessages(): Promise<void>` — writes the current `aiRuntime.history` to the active conversation's IDB record via `_idbPutRecord('conversations', conversation)`. Auto-generates `excerpt` from first user message. Updates `updatedAt`.
- Call `saveConversationMessages()` after every assistant reply completes (at the end of the streaming/response handler in `ai-runtime.ts`).

### 5c. Update `packages/core/src/ai/ai-ui.ts`

**Conversation Sidebar Panel**

Add a left sidebar to the AI workspace view that shows:

- A "New Conversation" button at the top
- A list of past conversations sorted by `updatedAt` descending
- Each item shows: title (first 40 chars, truncated with ellipsis), relative time (e.g. "2 hours ago"), and a delete button (×)
- The active conversation is highlighted
- If no conversations exist, show: "No past conversations. Start chatting to create one."

**New Conversation flow:**

1. User clicks "New Conversation"
2. Create a new conversation record in IDB: `{ id: uuid(), title: 'New Conversation', messages: [], createdAt: now, updatedAt: now }`
3. Add to `state.conversations`, set `state.activeConversationId` to new id
4. Call `setActiveConversation(newId)` — clears `aiRuntime.history`
5. Re-render the AI workspace

**Switch Conversation flow:**

1. User clicks a past conversation in the sidebar
2. Call `setActiveConversation(id)` — loads history from that conversation
3. Set `state.activeConversationId = id`, call `setState`
4. Re-render the AI workspace — the chat panel shows the loaded history

**Auto-title:**
After the first assistant reply in a new conversation, auto-generate a title by taking the first 6 words of the first user message. Update the conversation record in IDB and in `state.conversations`.

**Delete Conversation:**

- Clicking × on a conversation item shows a confirm dialog (use `showConfirm` from `state.ts`)
- On confirm: delete from IDB via `_idbDeleteRecord('conversations', id)`, remove from `state.conversations`, if it was active clear `state.activeConversationId` and start a new blank conversation

**Chat History Display:**
When loading a past conversation, render all its saved messages in the chat panel (user + assistant bubbles) with timestamps. New messages append to the display and are immediately saved to IDB.

**Rename Conversation:**
Double-click on the conversation title in the sidebar to make it editable inline. On blur or Enter key: save new title to IDB.

---

## Task 6: Extend Time Tracker — Edit, Delete, Manual Entry

In `packages/core/src/views/time-tracker.ts`:

**Add Manual Entry button**: "Add Time Entry" opens a modal form with fields:

- Task (select from tasks, optional)
- Description (text)
- Date (date input, default today)
- Start time (time input)
- End time (time input) — or Duration (hours:minutes) — whichever is simpler; derive `durationSeconds` from the two times
- On save: call `dbCreate('timeEntries', { id: uuid(), startedAt, endedAt, durationSeconds, taskId, description, createdAt: now, updatedAt: now })`

**Add Edit action on each entry**: clicking edit on a logged entry opens the same form pre-filled. On save: `dbUpdate('timeEntries', id, changes)`.

**Add Delete action on each entry**: clicking delete shows a confirm dialog. On confirm: `dbDelete('timeEntries', id)`.

**Running timer entries**: cannot be edited or deleted while running (show timer badge, disable actions). Only stopped entries are editable/deletable.

---

## Task 7: Extend Notifications — Delete and Preferences

In `packages/core/src/views/settings.ts` (Notifications section) and the topbar notification panel in `packages/core/src/views/topbar.ts`:

**Topbar notification panel changes:**

- Add a "Delete" (×) button on each individual notification item
- Add "Clear All" button at the top of the panel (clears all notifications for current session)
- Delete: calls `dbDelete('notifications', id)` then re-renders panel

**Settings → Notifications section:**
Add a "Notification Preferences" section under the existing notification display. Include toggle switches (use the existing toggle component pattern from the CSS) for:

- Due date reminders (tasks due within 2 days)
- Overdue task alerts
- Mention notifications (future use — render as toggle, save preference to localStorage key `taskapp_notif_prefs_v1`)

Store preferences as JSON in `localStorage` key `taskapp_notif_prefs_v1`: `{ dueDateReminders: boolean, overdueAlerts: boolean, mentions: boolean }`. Load on init in `main.ts` and pass via state or directly to `checkDueDates()`.

---

## Task 8: Extend Tags — Full CRUD in Settings

In `packages/core/src/views/settings.ts` (Tags section), the current implementation supports create and delete but not edit.

**Add Edit capability:**

- Each tag row gets an "Edit" (pencil) icon button
- Clicking edit makes the tag name and color swatch inline-editable (or opens a small inline form below the row)
- Color: use `<input type="color">` for the color picker
- On save: `dbUpdate('tags', id, { name, color })`
- Validate: name must not be empty; color must be a valid hex string

---

## Task 9: Add File Update Operation

In `packages/core/src/views/library.ts` and/or `packages/core/src/views/record-modal.ts`, add an edit action for file records:

**Edit file modal**: a small modal with fields:

- Name (text, required)
- URL (text, optional — for externally linked files)
- On save: `dbUpdate('files', id, { name, url, updatedAt: now })`

Wire the edit button on each file card in the Library view and in the file list inside record modals.

---

## Task 10: Fix Sidebar User Profile

In `packages/core/src/views/sidebar.ts`, replace the hardcoded `"U"` avatar and `"Your Name"` text:

- Read from `localStorage` key `taskapp_user_profile_v1` (JSON: `{ displayName: string, initials: string }`).
- Default to `{ displayName: 'Your Name', initials: 'U' }` if not set.
- The initials go in the avatar div, the displayName in the span.

In `packages/core/src/views/settings.ts`, add a "Profile" section at the top of the settings view:

- Text input: "Display Name"
- Text input: "Initials" (max 2 characters, auto-derived from displayName but editable)
- On save: write to `localStorage` key `taskapp_user_profile_v1`, show a success toast, re-render sidebar

---

## Task 11: Fix Accessibility Debt

These are tracked as known debt in the test files and must be resolved.

### 11a. Add `aria-modal="true"` to all modals

Search for every element that acts as a modal overlay in:

- `packages/core/src/ui/components.ts` (confirm dialog, notification panel, command palette)
- `packages/core/src/views/record-modal.ts`
- `packages/core/src/views/documents.ts` (document editor modal)
- `packages/core/src/views/library.ts` (file viewer)
- `packages/core/src/ai/ai-settings.ts` (nano download modal, settings wizard)

Add `aria-modal="true"` to the innermost dialog container element in each modal. For modals that render a backdrop + a content panel, add it to the content panel div.

### 11b. Add `role="alertdialog"` to the confirm dialog

In `packages/core/src/ui/components.ts`, the `renderConfirmDialog()` function renders the destructive confirm modal. Change its container `role` to `"alertdialog"` (not `"dialog"`) since it requires an immediate user response. Also ensure it has `aria-labelledby` pointing to the title element id and `aria-describedby` pointing to the message element id.

### 11c. Add unavailability messages for conditional features

In `packages/core/src/views/settings.ts`:

- **File System API**: if `'showSaveFilePicker' in window` is false, instead of hiding the vault file section, show a message: `"Vault file backup is available in Chrome and Edge only."`
- **WebAuthn/Passkeys**: if `isWebAuthnAvailable()` returns false, instead of hiding the section, show: `"Passkey authentication requires a browser with WebAuthn support (Chrome 67+, Edge 18+, Safari 14+)."`

---

## Task 12: Wire Everything into `main.ts`

After creating all new views and schemas, update `packages/core/src/main.ts`:

1. **Import new views**: `communications.ts`
2. **Import new schemas**: all new schema files (for the record modal)
3. **Call hook setters** for the communications view before first render: `setCommunicationsHooks(appRenderWorkspace)`
4. **Load conversations on init**: after `dbInit()`, load conversations from IDB and set `state.conversations`. Set `state.activeConversationId` to the most recently updated conversation's id.
5. **Load notification preferences** from `localStorage` on init
6. **Load user profile** from `localStorage` on init (for sidebar display)
7. **Wire communications** into `fullRender` and `appRenderWorkspace` switch statements — add `case 'communications': ...`
8. **Ensure `reloadData()`** in `state.ts` picks up communications from the in-memory store

---

## Task 13: Register Communications in Record Modal

In `packages/core/src/views/record-modal.ts`, add the `'communications'` store to the `SCHEMAS` record. Define its fields matching the Communication schema from Task 2:

- `type`: select field with options from `COMM_TYPES`
- `subject`: text, required
- `body`: textarea
- `occurredAt`: datetime-local, required
- `durationMinutes`: number (conditional on type being call or meeting)
- `personId`: select from people
- `clientId`: select from clients

---

## Task 14: Update Dashboard to Show Missing Entities

In `packages/core/src/views/dashboard.ts`:

- Add a "Recent Activity" card showing the 5 most recent communications (type icon + subject + date)
- Add a "Running Timer" card (only visible when `state.runningTimer` is set) — this may already exist, verify and add if missing

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm run typecheck` passes with zero errors
- [ ] `pnpm run build:offline` produces a valid `dist/offline/index.html`
- [ ] Communications view: can log a call, email, meeting, note; can edit and delete each
- [ ] Conversations: can start new chat, send messages, see them saved and reloaded, rename, delete
- [ ] Past conversations appear in the AI sidebar and can be switched between
- [ ] Time tracker: can add a manual entry, edit an entry, delete an entry
- [ ] Notifications panel: can delete individual notifications and clear all
- [ ] Notification preferences saved to localStorage and survive page reload
- [ ] Tags in settings: can edit name and color of an existing tag
- [ ] Files in library: can edit file name via the edit button
- [ ] Sidebar shows localStorage-stored display name and initials
- [ ] Settings profile section saves name/initials and updates sidebar immediately
- [ ] All modals have `aria-modal="true"`
- [ ] Confirm dialog has `role="alertdialog"` with `aria-labelledby` and `aria-describedby`
- [ ] Settings shows graceful unavailability messages for File System API and WebAuthn on unsupported browsers

---

## Documentation to Update After Implementation

After implementation is complete, update:

- `CLAUDE.md` — update Views list, AppState shape, module dependency order for new imports in main.ts
- `CHANGELOG.md` — new version entry listing all additions
