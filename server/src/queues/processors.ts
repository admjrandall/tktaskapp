import type { Job } from 'bullmq'
import type { CrmJobData, CrmJobResult } from './types.js'
import { auditEvents } from '../db/schema/audit-events.js'
import { clients } from '../db/schema/clients.js'
import { tasks } from '../db/schema/tasks.js'
import { people } from '../db/schema/people.js'
import { projects } from '../db/schema/projects.js'
import { eq, and, isNull } from 'drizzle-orm'
import { withTenant, writeAuditEvent } from '../services/base.js'
import { getBullRedis } from './redis.js'

// ── data:export ───────────────────────────────────────────────────────────────

async function processDataExport(job: Job<CrmJobData, CrmJobResult>): Promise<CrmJobResult> {
  if (job.data.type !== 'data:export') throw new Error('type mismatch')
  const { tenantId, userId, format, resource, requestId } = job.data

  await job.updateProgress(5)

  let rows: Record<string, unknown>[] = []

  await withTenant(tenantId, async (tx) => {
    if (resource === 'audit' || resource === 'all') {
      const r = await tx
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.orgId, tenantId))
        .limit(50_000)
      rows = rows.concat(r as unknown as Record<string, unknown>[])
    }
    if (resource === 'clients' || resource === 'all') {
      const r = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.tenantId, tenantId), isNull(clients.deletedAt)))
      rows = rows.concat(r as unknown as Record<string, unknown>[])
    }
    if (resource === 'tasks' || resource === 'all') {
      const r = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.tenantId, tenantId), isNull(tasks.deletedAt)))
      rows = rows.concat(r as unknown as Record<string, unknown>[])
    }
    if (resource === 'people' || resource === 'all') {
      const r = await tx
        .select()
        .from(people)
        .where(and(eq(people.tenantId, tenantId), isNull(people.deletedAt)))
      rows = rows.concat(r as unknown as Record<string, unknown>[])
    }
    if (resource === 'projects' || resource === 'all') {
      const r = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.tenantId, tenantId), isNull(projects.deletedAt)))
      rows = rows.concat(r as unknown as Record<string, unknown>[])
    }
  })

  await job.updateProgress(70)

  let output: string
  if (format === 'json') {
    output = JSON.stringify(rows, null, 2)
  } else {
    const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
    const header = allKeys.join(',')
    const csvRows = rows.map((r) =>
      allKeys
        .map((k) => {
          const v = r[k]
          if (v === null || v === undefined) return ''
          const s =
            typeof v === 'object'
              ? JSON.stringify(v)
              : (v as string | number | boolean | bigint).toString()
          return `"${s.replace(/"/g, '""')}"`
        })
        .join(','),
    )
    output = [header, ...csvRows].join('\n')
  }

  // Store in Redis with 2-hour TTL; client retrieves via GET /api/v1/exports/:jobId
  const redis = await getBullRedis()
  const exportKey = `export:${requestId}`
  await redis.set(exportKey, output, 'EX', 7_200)

  await writeAuditEvent({
    tenantId,
    userId,
    eventType: 'data.exported',
    resourceType: resource,
    details: { format, rowCount: rows.length, exportKey },
  })

  await job.updateProgress(100)
  return { success: true, message: `Exported ${rows.length} rows`, exportKey }
}

// ── ai:compute-attributes ─────────────────────────────────────────────────────

async function fetchRecord(
  tenantId: string,
  resourceType: string,
  resourceId: string,
): Promise<Record<string, unknown> | null> {
  return withTenant(tenantId, async (tx) => {
    switch (resourceType) {
      case 'clients': {
        const [r] = await tx
          .select()
          .from(clients)
          .where(and(eq(clients.id, resourceId), eq(clients.tenantId, tenantId)))
          .limit(1)
        return r ? r : null
      }
      case 'tasks': {
        const [r] = await tx
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, resourceId), eq(tasks.tenantId, tenantId)))
          .limit(1)
        return r ? r : null
      }
      case 'people': {
        const [r] = await tx
          .select()
          .from(people)
          .where(and(eq(people.id, resourceId), eq(people.tenantId, tenantId)))
          .limit(1)
        return r ? r : null
      }
      case 'projects': {
        const [r] = await tx
          .select()
          .from(projects)
          .where(and(eq(projects.id, resourceId), eq(projects.tenantId, tenantId)))
          .limit(1)
        return r ? r : null
      }
      default:
        return null
    }
  })
}

async function processAiCompute(job: Job<CrmJobData, CrmJobResult>): Promise<CrmJobResult> {
  if (job.data.type !== 'ai:compute-attributes') throw new Error('type mismatch')
  const { tenantId, userId, resourceType, resourceId, attributeDefId, forceRefresh } = job.data

  await job.updateProgress(10)

  const record = await fetchRecord(tenantId, resourceType, resourceId)
  if (!record) return { success: false, message: `Record ${resourceId} not found` }

  await job.updateProgress(30)

  // Call the LLM client directly — authorization was checked when the job was enqueued
  const { callLlm } = await import('../ai-gateway/llm-client.js')

  const userMessage = `Compute attribute "${attributeDefId}" for this ${resourceType} record:\n${JSON.stringify(record, null, 2)}`
  const llmResult = await callLlm({
    model: process.env['AI_DEFAULT_MODEL'] ?? 'claude-opus-4-8',
    systemPrompt: `You are a CRM attribute extraction assistant. Return a JSON object with the computed attribute value.`,
    userMessage,
    maxTokens: 512,
    temperature: 0,
  })

  await job.updateProgress(80)

  await writeAuditEvent({
    tenantId,
    userId,
    eventType: 'ai_attribute.computed',
    resourceType,
    resourceId,
    details: { attributeDefId, forceRefresh, model: llmResult.model },
  })

  await job.updateProgress(100)
  return { success: true, result: llmResult.content, model: llmResult.model }
}

// ── gdpr:erase ────────────────────────────────────────────────────────────────

async function processGdprErase(job: Job<CrmJobData, CrmJobResult>): Promise<CrmJobResult> {
  if (job.data.type !== 'gdpr:erase') throw new Error('type mismatch')
  const { tenantId, actorUserId, targetUserId } = job.data

  await job.updateProgress(5)

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(people)
      .set({ name: '[erased]', email: null, phone: null, updatedAt: new Date() })
      .where(and(eq(people.tenantId, tenantId), eq(people.id, targetUserId)))

    await job.updateProgress(50)

    await writeAuditEvent({
      tenantId,
      userId: actorUserId,
      eventType: 'gdpr.erased',
      resourceType: 'user',
      resourceId: targetUserId,
      details: { targetUserId },
    })
  })

  await job.updateProgress(100)
  return { success: true, message: `GDPR erase complete for user ${targetUserId}` }
}

// ── notification:dispatch ─────────────────────────────────────────────────────

async function processNotificationDispatch(
  job: Job<CrmJobData, CrmJobResult>,
): Promise<CrmJobResult> {
  if (job.data.type !== 'notification:dispatch') throw new Error('type mismatch')
  const { tenantId, userId, notificationId, channel } = job.data

  await job.updateProgress(20)

  if (channel === 'in-app') {
    const { notifications } = await import('../db/schema/notifications.js')
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.tenantId, tenantId), eq(notifications.id, notificationId)))
    })
  }
  // email channel: would call external email service here

  await writeAuditEvent({
    tenantId,
    userId,
    eventType: 'notification.dispatched',
    resourceType: 'notification',
    resourceId: notificationId,
    details: { channel },
  })

  await job.updateProgress(100)
  return { success: true, message: `Dispatched ${channel} notification ${notificationId}` }
}

// ── Dispatch table ─────────────────────────────────────────────────────────────

export async function processJob(job: Job<CrmJobData, CrmJobResult>): Promise<CrmJobResult> {
  switch (job.data.type) {
    case 'data:export':
      return processDataExport(job)
    case 'ai:compute-attributes':
      return processAiCompute(job)
    case 'gdpr:erase':
      return processGdprErase(job)
    case 'notification:dispatch':
      return processNotificationDispatch(job)
    default: {
      const _exhaustive: never = job.data
      throw new Error(`Unknown job type: ${JSON.stringify(_exhaustive)}`)
    }
  }
}
