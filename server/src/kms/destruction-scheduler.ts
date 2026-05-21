import { db } from '../db/index.js'
import { kmsKeyLifecycle } from '../db/schema/kms-keys.js'
import { AzureKeyVaultKeyService } from './key-service.js'
import { writeAuditEvent } from '../services/base.js'
import { and, eq, lte, sql } from 'drizzle-orm'
import { otel } from '../observability/otel.js'

const POLL_INTERVAL_MS = 60_000

async function _runOnce(): Promise<void> {
  const vaultUrl = process.env['AZURE_KV_URL']
  if (!vaultUrl) return

  const now = new Date()

  // Find keys scheduled for destruction where effectiveAt has passed
  // and no subsequent DESTROYED event exists for the same keyVaultUri
  const pending = await db
    .select()
    .from(kmsKeyLifecycle)
    .where(
      and(eq(kmsKeyLifecycle.event, 'SCHEDULE_DESTRUCTION'), lte(kmsKeyLifecycle.effectiveAt, now)),
    )

  if (pending.length === 0) return

  const kmsService = new AzureKeyVaultKeyService(vaultUrl)

  for (const row of pending) {
    // Check if a DESTROYED event already exists for this keyVaultUri
    const destroyed = await db
      .select({ id: kmsKeyLifecycle.id })
      .from(kmsKeyLifecycle)
      .where(
        and(
          eq(kmsKeyLifecycle.keyVaultUri, row.keyVaultUri),
          eq(kmsKeyLifecycle.event, 'DESTROYED'),
        ),
      )
      .limit(1)

    if (destroyed.length > 0) continue

    try {
      // Destroy the key via Azure Key Vault
      const keyName = `tktaskapp-user-${row.userId}`
      const keyClient = (
        kmsService as unknown as {
          _keyClient: {
            beginDeleteKey: (name: string) => Promise<{ pollUntilDone: () => Promise<unknown> }>
          }
        }
      )._keyClient
      const poller = await keyClient.beginDeleteKey(keyName)
      await poller.pollUntilDone()

      // Write DESTROYED event (append-only)
      await db.insert(kmsKeyLifecycle).values({
        orgId: row.orgId,
        userId: row.userId,
        keyVaultUri: row.keyVaultUri,
        keyVersion: row.keyVersion,
        event: 'DESTROYED',
        effectiveAt: new Date(),
      })

      await writeAuditEvent({
        tenantId: row.orgId as string,
        userId: 'system',
        eventType: 'kms_key.destroyed',
        resourceType: 'kmsKeyLifecycle',
        resourceId: row.id as string,
        details: { keyVaultUri: row.keyVaultUri, userId: row.userId },
      })

      otel.log({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'tktaskapp-server',
        tenantId: row.orgId as string,
        requestId: 'destruction-scheduler',
        message: `KMS key destroyed for user ${row.userId}`,
      })
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId: row.orgId as string,
        requestId: 'destruction-scheduler',
        message: `Failed to destroy KMS key for user ${row.userId}`,
        extra: { error: String(err) },
      })
    }
  }
}

export function startDestructionScheduler(): NodeJS.Timeout {
  return setInterval(() => {
    _runOnce().catch((err: unknown) => {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId: 'system',
        requestId: 'destruction-scheduler',
        message: 'Destruction scheduler error',
        extra: { error: String(err) },
      })
    })
  }, POLL_INTERVAL_MS)
}

export function stopDestructionScheduler(timer: NodeJS.Timeout): void {
  clearInterval(timer)
}
