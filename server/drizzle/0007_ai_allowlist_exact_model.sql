DELETE FROM ai_endpoint_allowlist
WHERE model_id IS NULL OR btrim(model_id) = '';

ALTER TABLE ai_endpoint_allowlist
  ALTER COLUMN model_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_endpoint_allowlist_org_provider_model_unique
  ON ai_endpoint_allowlist (org_id, provider, model_id);
