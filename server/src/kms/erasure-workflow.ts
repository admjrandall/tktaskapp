import { LegalHoldService } from './legal-hold.js'
import { AzureKeyVaultKeyService, LegalHoldActiveError } from './key-service.js'
import { writeAuditEvent, withTenant } from '../services/base.js'
import { tenantUsers } from '../db/schema/users.js'
import { projects } from '../db/schema/projects.js'
import { tasks } from '../db/schema/tasks.js'
import { communications } from '../db/schema/communications.js'
import { documents } from '../db/schema/documents.js'
import { conversations } from '../db/schema/conversations.js'
import { notifications } from '../db/schema/notifications.js'
import { timeEntries } from '../db/schema/time-entries.js'
import { standaloneNotes } from '../db/schema/standalone-notes.js'
import { and, eq } from 'drizzle-orm'

const _legalHoldService = new LegalHoldService()

export interface ErasureResult {
  userId: string
  status: 'scheduled'
  effectiveAt: Date
  auditEventId: string
}

export async function runErasureWorkflow(
  userId: string,
  tenantId: string,
  requestedBy: string,
): Promise<ErasureResult> {
  // 1. Check for active legal hold
  const onHold = await _legalHoldService.isUserOnHold(tenantId, userId)
  if (onHold) {
    throw new LegalHoldActiveError(userId)
  }

  const effectiveAt = new Date()

  // 2. Schedule KMS key destruction (immediate)
  const vaultUrl = process.env['AZURE_KV_URL']
  if (vaultUrl) {
    const kmsService = new AzureKeyVaultKeyService(vaultUrl)
    await kmsService.scheduleKeyDestruction(userId, tenantId, effectiveAt)
  }

  // 3. Soft-delete records directly attributable to the erased user. Shared
  // tenant/client data is intentionally preserved unless it has an explicit user
  // owner/creator field matching the DSAR subject.
  const deletedAt = new Date()
  await withTenant(tenantId, async (tx) => {
    await Promise.allSettled([
      tx
        .update(tenantUsers)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(tenantUsers.id, userId as never), eq(tenantUsers.orgId, tenantId as never))),
      tx
        .update(projects)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(projects.tenantId, tenantId), eq(projects.ownerId, userId))),
      tx
        .update(tasks)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(tasks.tenantId, tenantId), eq(tasks.assigneeId, userId))),
      tx
        .update(communications)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(communications.tenantId, tenantId), eq(communications.createdBy, userId))),
      tx
        .update(documents)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(documents.tenantId, tenantId), eq(documents.createdBy, userId))),
      tx
        .update(conversations)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(conversations.tenantId, tenantId), eq(conversations.userId, userId))),
      tx
        .update(notifications)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId))),
      tx
        .update(timeEntries)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(timeEntries.tenantId, tenantId), eq(timeEntries.userId, userId))),
      tx
        .update(standaloneNotes)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(standaloneNotes.tenantId, tenantId), eq(standaloneNotes.createdBy, userId))),
    ])
  })

  // 4. Write audit event
  const auditEventId = await writeAuditEvent({
    tenantId,
    userId: requestedBy,
    eventType: 'gdpr_erasure_requested',
    resourceType: 'users',
    resourceId: userId,
    details: { effectiveAt: effectiveAt.toISOString(), requestedBy },
  })

  return { userId, status: 'scheduled', effectiveAt, auditEventId }
}
