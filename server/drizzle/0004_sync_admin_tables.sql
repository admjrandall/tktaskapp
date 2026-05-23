-- Migration: sync_documents + admin support tables (Phase 3)
-- sync_documents: Hono-native 3-endpoint replication store (C.3)
-- org_settings, ai_endpoint_allowlist, integrations: admin route backing store

-- ── sync_documents ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_documents (
  id          text        NOT NULL,
  org_id      text        NOT NULL,
  store       text        NOT NULL,
  rev         text        NOT NULL,
  data        jsonb       NOT NULL,
  deleted     boolean     NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, store, org_id)
);

CREATE INDEX IF NOT EXISTS sync_documents_org_updated
  ON sync_documents (org_id, updated_at);

ALTER TABLE sync_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY sync_tenant_isolation ON sync_documents
  USING (org_id = current_setting('app.tenant_id', true));

CREATE POLICY sync_tenant_insert ON sync_documents
  FOR INSERT WITH CHECK (org_id = current_setting('app.tenant_id', true));

-- ── org_settings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_settings (
  org_id           text        PRIMARY KEY,
  lockdown_level   text        NOT NULL DEFAULT 'off',
  retention_days   integer     NOT NULL DEFAULT 2190,
  compliance_packs jsonb       NOT NULL DEFAULT '[]',
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY org_settings_isolation ON org_settings
  USING (org_id = current_setting('app.tenant_id', true));

CREATE POLICY org_settings_insert ON org_settings
  FOR INSERT WITH CHECK (org_id = current_setting('app.tenant_id', true));

-- ── ai_endpoint_allowlist ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_endpoint_allowlist (
  id          text        PRIMARY KEY,
  org_id      text        NOT NULL,
  provider    text        NOT NULL,
  model_id    text,
  reason      text        NOT NULL,
  created_by  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_endpoint_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_endpoint_allowlist FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_allowlist_isolation ON ai_endpoint_allowlist
  USING (org_id = current_setting('app.tenant_id', true));

CREATE POLICY ai_allowlist_insert ON ai_endpoint_allowlist
  FOR INSERT WITH CHECK (org_id = current_setting('app.tenant_id', true));

-- ── integrations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations (
  id          text        PRIMARY KEY,
  org_id      text        NOT NULL,
  name        text        NOT NULL,
  type        text        NOT NULL,
  config      jsonb       NOT NULL DEFAULT '{}',
  created_by  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;

CREATE POLICY integrations_isolation ON integrations
  USING (org_id = current_setting('app.tenant_id', true));

CREATE POLICY integrations_insert ON integrations
  FOR INSERT WITH CHECK (org_id = current_setting('app.tenant_id', true));
