import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'

/**
 * Append-only access-token revocation list.
 * Entries are inserted on explicit revocation (logout, step-up failure, admin suspension).
 * authMiddleware checks this table before granting access.
 * Expired entries are pruned lazily via pruneExpiredRevocations().
 *
 * Token hashes (SHA-256, base64url) are stored — never raw token material.
 * This table is NOT tenant-scoped: a revoked token must be rejected globally.
 */
export const revokedAccessTokens = pgTable(
  'revoked_access_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** SHA-256(raw access token), base64url-encoded. */
    tokenHash: text('token_hash').notNull().unique(),
    /** ISO UTC expiry copied from the token's `exp` claim. Rows after this time are dead. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Why the token was revoked — for audit evidence. */
    reason: text('reason').notNull().default('logout'),
    /** Internal user UUID if available. Null for tokens revoked before user resolution. */
    userId: uuid('user_id'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('revoked_access_tokens_hash_idx').on(t.tokenHash)],
)
