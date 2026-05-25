-- 0007_ai_allowlist_exact_model.sql
-- Tightens the ai_endpoint_allowlist schema: removes rows with NULL or blank
-- model_id, then makes model_id NOT NULL. This enforces the invariant that every
-- allowlist entry must name a specific model identifier, preventing wildcards
-- (e.g. empty model_id matching all models) from bypassing the AI gateway policy.
--
-- Position: must follow 0004_sync_admin_tables.sql (which creates ai_endpoint_allowlist).
-- Destructive data change: rows with NULL/blank model_id are deleted — confirm no
-- production rows are affected before running on a live database.

DELETE FROM ai_endpoint_allowlist
WHERE model_id IS NULL OR btrim(model_id) = '';

ALTER TABLE ai_endpoint_allowlist
  ALTER COLUMN model_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_endpoint_allowlist_org_provider_model_unique
  ON ai_endpoint_allowlist (org_id, provider, model_id);
