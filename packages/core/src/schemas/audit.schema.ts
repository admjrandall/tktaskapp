// C.6 — extended with hash-chain fields and new AI/persona/workspace event types
import * as v from 'valibot'

export const AuditEventTypeSchema = v.picklist([
  // Auth
  'session_start',
  'auth_success',
  'auth_failure',
  'auth_locked',
  'auth_unlocked',
  'mfa_success',
  'mfa_failure',
  'mfa_enabled',
  'mfa_disabled',
  'passkey_registered',
  'passkey_removed',
  'app_locked',
  'app_unlocked',
  'password_changed',
  // Data
  'vault_file_opened',
  'vault_exported',
  'vault_imported',
  'backup_exported',
  'backup_imported',
  'data_exported',
  'data_imported',
  'app_reset',
  // AI (base)
  'ai_key_added',
  'ai_key_removed',
  'ai_query',
  // AI extended (C.6)
  'ai_attribute_computed',
  'ai_attribute_failed',
  'ai_command_executed',
  'ai_command_rejected',
  'ai_chat_message',
  // Adaptive UX (C.6)
  'adaptive_suggestion_proposed',
  'adaptive_suggestion_accepted',
  'adaptive_suggestion_dismissed',
  // DLP / lockdown (C.6)
  'dlp_warning_shown',
  'dlp_action_proceeded',
  'lockdown_violation_blocked',
  // Sync (C.6)
  'sync_pull',
  'sync_push',
  'sync_conflict_resolved',
  // Extension objects (C.6)
  'extension_object_defined',
  'extension_object_instance_created',
  'extension_object_instance_updated',
  'extension_object_instance_deleted',
  // Workspace / persona (C.6)
  'workspace_layout_changed',
  'persona_selected',
  'persona_changed',
])

export const AuditEntrySchema = v.object({
  id: v.string(),
  ts: v.string(),
  event: AuditEventTypeSchema,
  details: v.record(v.string(), v.string()),
  ua: v.string(),
  // C.6 hash-chain fields
  chainPosition: v.optional(v.number()),
  prevHash: v.optional(v.nullable(v.string())),
  signedDigest: v.optional(v.string()),
})

export type AuditEventType = v.InferOutput<typeof AuditEventTypeSchema>
export type AuditEntry = v.InferOutput<typeof AuditEntrySchema>
