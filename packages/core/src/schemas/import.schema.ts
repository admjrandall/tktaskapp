// Validates the JSON import payload from exportJSON / JSON export flow.
// Rules: store names must match known STORES/IDB_STORES; each record must
// have at minimum id, createdAt, updatedAt as strings.

import * as v from 'valibot'
import { STORES, IDB_STORES } from '../constants.js'

const IMPORT_BLOCKED_STORES = new Set(['trash', 'notifications'])
const KNOWN_STORES = new Set([...STORES, ...IDB_STORES])

// Minimum shape every importable record must satisfy.
export const BaseImportRecordSchema = v.looseObject({
  id: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
})

export type BaseImportRecord = v.InferOutput<typeof BaseImportRecordSchema>

export type ImportValidationResult =
  | { success: true; data: Record<string, BaseImportRecord[]> }
  | { success: false; error: string }

function firstIssueMessage(result: v.SafeParseResult<typeof BaseImportRecordSchema>): string {
  if (result.success) return ''
  const issue = result.issues.at(0)
  if (!issue) return 'invalid record'
  const path = issue.path?.map((p) => String(p.key)).join('.') ?? ''
  return path ? `${path}: ${issue.message}` : issue.message
}

export function validateImportPayload(raw: unknown): ImportValidationResult {
  if (typeof raw !== 'object' || Array.isArray(raw) || raw === null) {
    return { success: false, error: 'Import must be a JSON object mapping store names to arrays' }
  }
  const obj = raw as Record<string, unknown>
  const validated: Record<string, BaseImportRecord[]> = {}

  for (const [storeName, arr] of Object.entries(obj)) {
    if (!KNOWN_STORES.has(storeName)) {
      return {
        success: false,
        error: `Unknown store in import: "${storeName}". Valid stores: ${[...KNOWN_STORES].join(', ')}`,
      }
    }
    if (IMPORT_BLOCKED_STORES.has(storeName)) {
      return {
        success: false,
        error: `Store "${storeName}" cannot be imported (GDPR / internal state)`,
      }
    }
    if (!Array.isArray(arr)) {
      return { success: false, error: `Store "${storeName}" must be an array, got ${typeof arr}` }
    }
    const records: BaseImportRecord[] = []
    for (let i = 0; i < arr.length; i++) {
      const result = v.safeParse(BaseImportRecordSchema, arr[i])
      if (!result.success) {
        return {
          success: false,
          error: `Store "${storeName}" record [${i}] is invalid — ${firstIssueMessage(result)}`,
        }
      }
      records.push(result.output)
    }
    validated[storeName] = records
  }

  return { success: true, data: validated }
}
