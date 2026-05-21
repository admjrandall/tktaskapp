import { db } from '../db/index.js'
import { legalHolds } from '../db/schema/legal-holds.js'
import { and, eq, isNull, or, gt } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

export class LegalHoldService {
  async placeHold(
    userId: string,
    tenantId: string,
    reason: string,
    expiresAt?: Date,
    placedBy?: string,
  ): Promise<string> {
    const id = randomUUID()
    await db.insert(legalHolds).values({
      id,
      userId,
      tenantId,
      reason,
      expiresAt: expiresAt ?? null,
      placedBy: placedBy ?? 'system',
    })
    return id
  }

  async liftHold(holdId: string, liftedBy: string): Promise<void> {
    await db
      .update(legalHolds)
      .set({ liftedAt: new Date(), liftedBy, updatedAt: new Date() })
      .where(eq(legalHolds.id, holdId))
  }

  async isUserOnHold(userId: string): Promise<boolean> {
    const now = new Date()
    const rows = await db
      .select({ id: legalHolds.id })
      .from(legalHolds)
      .where(
        and(
          eq(legalHolds.userId, userId),
          isNull(legalHolds.liftedAt),
          or(isNull(legalHolds.expiresAt), gt(legalHolds.expiresAt, now)),
        ),
      )
      .limit(1)
    return rows.length > 0
  }
}
