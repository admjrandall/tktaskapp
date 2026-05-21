import * as v from 'valibot'

export const AuditEventTypeSchema = v.picklist([
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
  'vault_file_opened',
  'vault_exported',
  'vault_imported',
  'backup_exported',
  'backup_imported',
  'data_exported',
  'data_imported',
  'app_reset',
  'ai_key_added',
  'ai_key_removed',
  'ai_query',
])

export const AuditEntrySchema = v.object({
  id: v.string(),
  ts: v.string(),
  event: AuditEventTypeSchema,
  details: v.record(v.string(), v.string()),
  ua: v.string(),
})

export type AuditEntry = v.InferOutput<typeof AuditEntrySchema>
