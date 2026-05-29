export const QUEUE_NAME = 'crm-jobs' as const
export const DLQ_NAME = 'crm-jobs-dlq' as const

// ── Job payload types ─────────────────────────────────────────────────────────

export type DataExportJobData = {
  type: 'data:export'
  tenantId: string
  userId: string
  format: 'csv' | 'json'
  resource: 'audit' | 'clients' | 'tasks' | 'people' | 'projects' | 'all'
  requestId: string
}

export type AiComputeJobData = {
  type: 'ai:compute-attributes'
  tenantId: string
  userId: string
  resourceType: string
  resourceId: string
  attributeDefId: string
  forceRefresh: boolean
}

export type GdprEraseJobData = {
  type: 'gdpr:erase'
  tenantId: string
  actorUserId: string
  targetUserId: string
}

export type NotificationDispatchJobData = {
  type: 'notification:dispatch'
  tenantId: string
  userId: string
  notificationId: string
  channel: 'in-app' | 'email'
}

export type CrmJobData =
  | DataExportJobData
  | AiComputeJobData
  | GdprEraseJobData
  | NotificationDispatchJobData

export type CrmJobResult = {
  success: boolean
  message?: string
  [key: string]: unknown
}

// ── Per-type retry configuration ──────────────────────────────────────────────

export const JOB_RETRY_CONFIG: Record<CrmJobData['type'], { attempts: number; delayMs: number }> = {
  'data:export': { attempts: 3, delayMs: 2_000 },
  'ai:compute-attributes': { attempts: 3, delayMs: 1_000 },
  'gdpr:erase': { attempts: 5, delayMs: 5_000 },
  'notification:dispatch': { attempts: 2, delayMs: 1_000 },
}
