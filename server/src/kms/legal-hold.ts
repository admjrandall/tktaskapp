import { legalHolds } from '../db/schema/legal-holds.js'
import { and, eq, isNull, or, gt } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { withTenant } from '../services/base.js'

export class LegalHoldService {
  async placeHold(
    userId: string,
    tenantId: string,
    reason: string,
    expiresAt?: Date,
    placedBy?: string,
  ): Promise<string> {
    const id = randomUUID()
    await withTenant(tenantId, async (tx) => {
      await tx.insert(legalHolds).values({
        id,
        userId,
        tenantId,
        reason,
        expiresAt: expiresAt ?? null,
        placedBy: placedBy ?? 'system',
      })
    })
    return id
  }

  async liftHold(tenantId: string, holdId: string, liftedBy: string): Promise<void> {
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(legalHolds)
        .set({ liftedAt: new Date(), liftedBy, updatedAt: new Date() })
        .where(and(eq(legalHolds.id, holdId), eq(legalHolds.tenantId, tenantId)))
    })
  }

  async isUserOnHold(tenantId: string, userId: string): Promise<boolean> {
    const now = new Date()
    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({ id: legalHolds.id })
        .from(legalHolds)
        .where(
          and(
            eq(legalHolds.tenantId, tenantId),
            eq(legalHolds.userId, userId),
            isNull(legalHolds.liftedAt),
            or(isNull(legalHolds.expiresAt), gt(legalHolds.expiresAt, now)),
          ),
        )
        .limit(1),
    )
    return rows.length > 0
  }
}
