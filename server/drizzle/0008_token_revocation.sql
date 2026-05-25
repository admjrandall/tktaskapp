-- Access-token revocation list.
-- Stores SHA-256(token) for each explicitly revoked access token.
-- authMiddleware checks this before granting access.
-- Expired rows are pruned lazily by pruneExpiredRevocations().

CREATE TABLE IF NOT EXISTS revoked_access_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  reason      text        NOT NULL DEFAULT 'logout',
  user_id     uuid,
  revoked_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS revoked_access_tokens_hash_idx
  ON revoked_access_tokens (token_hash);

-- Partial index for fast cleanup of expired rows.
CREATE INDEX IF NOT EXISTS revoked_access_tokens_expires_idx
  ON revoked_access_tokens (expires_at)
  WHERE expires_at < now();

-- No RLS on this table — token revocation must be globally enforced regardless of tenant context.
-- Only the server process (via authMiddleware) reads/writes this table.
-- GRANT SELECT, INSERT ON revoked_access_tokens TO tktaskapp_server;
-- GRANT DELETE ON revoked_access_tokens TO tktaskapp_cleanup;
