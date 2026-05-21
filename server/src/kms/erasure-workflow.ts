import { LegalHoldService } from './legal-hold.js'
import { AzureKeyVaultKeyService, LegalHoldActiveError } from './key-service.js'
import { writeAuditEvent } from '../services/base.js'
import { db } from '../db/index.js'
import { tenantUsers } from '../db/schema/users.js'
import { clients } from '../db/schema/clients.js'
import { projects } from '../db/schema/projects.js'
import { tasks } from '../db/schema/tasks.js'
import { people } from '../db/schema/people.js'
import { communications } from '../db/schema/communications.js'
import { documents } from '../db/schema/documents.js'
import { conversations } from '../db/schema/conversations.js'
import { eq } from 'drizzle-orm'

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
  const onHold = await _legalHoldService.isUserOnHold(userId)
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

  // 3. Soft-delete all user records across CRM tables
  const deletedAt = new Date()
  await Promise.allSettled([
    db
      .update(tenantUsers)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(tenantUsers.id, userId as never)),
    db
      .update(clients)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(clients.tenantId, tenantId)),
    db
      .update(projects)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(projects.ownerId, userId)),
    db.update(tasks).set({ deletedAt, updatedAt: deletedAt }).where(eq(tasks.assigneeId, userId)),
    db.update(people).set({ deletedAt, updatedAt: deletedAt }).where(eq(people.clientId, userId)),
    db
      .update(communications)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(communications.createdBy, userId)),
    db
      .update(documents)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(documents.createdBy, userId)),
    db
      .update(conversations)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(eq(conversations.userId, userId)),
  ])

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
