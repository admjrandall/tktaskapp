// Validates AI tool argument shapes before any mutation tool call executes.
// Read-only tools skip validation (no data mutation risk).

import * as v from 'valibot'

const MUTABLE_STORES = v.picklist([
  'tasks',
  'clients',
  'projects',
  'people',
  'departments',
  'communications',
  'files',
  'standaloneNotes',
  'timeEntries',
  'tags',
])

const RelatedToSchema = v.object({
  store: v.string(),
  id_or_name: v.string(),
})

const CreateRecordArgsSchema = v.object({
  store: MUTABLE_STORES,
  fields: v.record(v.string(), v.unknown()),
})

const UpdateRecordArgsSchema = v.object({
  store: MUTABLE_STORES,
  id_or_name: v.string(),
  changes: v.record(v.string(), v.unknown()),
})

const DeleteRecordArgsSchema = v.object({
  store: MUTABLE_STORES,
  id_or_name: v.string(),
})

const StartTimerArgsSchema = v.object({
  taskId_or_name: v.optional(v.string()),
  description: v.optional(v.string()),
})

const LogCommunicationArgsSchema = v.object({
  type: v.picklist(['Email', 'Call', 'Meeting', 'Note', 'Other']),
  body: v.string(),
  subject: v.optional(v.string()),
  relatedTo: v.optional(RelatedToSchema),
})

const AttachFileArgsSchema = v.object({
  name: v.string(),
  relatedTo: v.optional(RelatedToSchema),
  url: v.optional(v.string()),
})

export type ToolValidationResult = { success: true } | { success: false; error: string }

type AnySchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>

function _firstMsg(issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]]): string {
  const issue = issues[0]
  const path = issue.path?.map((p) => String(p.key)).join('.') ?? ''
  return path ? `${path}: ${issue.message}` : issue.message
}

function _check(schema: AnySchema, args: Record<string, unknown>): ToolValidationResult {
  const result = v.safeParse(schema, args)
  if (!result.success) return { success: false, error: _firstMsg(result.issues) }
  return { success: true }
}

export function validateToolArgs(
  tool: string,
  args: Record<string, unknown>,
): ToolValidationResult {
  switch (tool) {
    case 'create_record':
      return _check(CreateRecordArgsSchema, args)
    case 'update_record':
      return _check(UpdateRecordArgsSchema, args)
    case 'delete_record':
      return _check(DeleteRecordArgsSchema, args)
    case 'start_timer':
      return _check(StartTimerArgsSchema, args)
    case 'log_communication':
      return _check(LogCommunicationArgsSchema, args)
    case 'attach_file':
      return _check(AttachFileArgsSchema, args)
    default:
      return { success: true } // read-only or unknown — skip
  }
}
