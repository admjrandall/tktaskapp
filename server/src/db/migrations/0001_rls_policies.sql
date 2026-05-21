-- Row-Level Security policies for Task App CRM
-- Run after initial schema creation (drizzle-kit push or first migration).
-- These policies enforce tenant isolation at the database level.
-- Every table with org_id MUST have RLS enabled — application-level filtering is a
-- secondary defence, not a substitute for DB-level isolation.

-- ── tenant_users ──────────────────────────────────────────────────────────────

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_users
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY tenant_insert ON tenant_users
  FOR INSERT WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- ── user_kms_keys ─────────────────────────────────────────────────────────────

ALTER TABLE user_kms_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_kms_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_kms_keys
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY tenant_insert ON user_kms_keys
  FOR INSERT WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- ── audit_events ──────────────────────────────────────────────────────────────
-- Append-only: application role has INSERT + SELECT only, never UPDATE or DELETE.

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON audit_events
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY tenant_insert ON audit_events
  FOR INSERT WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- ── kms_key_lifecycle ─────────────────────────────────────────────────────────
-- Append-only: INSERT only; no UPDATE or DELETE permitted at DB level.

ALTER TABLE kms_key_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE kms_key_lifecycle FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON kms_key_lifecycle
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY tenant_insert ON kms_key_lifecycle
  FOR INSERT WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- ── Application role grants ───────────────────────────────────────────────────
-- Create the app role and grant minimum privileges. Run once per environment.
-- Replace 'tktaskapp_app' with your actual PostgreSQL role name.

-- CREATE ROLE tktaskapp_app LOGIN PASSWORD '...';

-- GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_users      TO tktaskapp_app;
-- GRANT SELECT, INSERT                  ON audit_events      TO tktaskapp_app;  -- no UPDATE/DELETE
-- GRANT SELECT, INSERT                  ON kms_key_lifecycle TO tktaskapp_app;  -- no UPDATE/DELETE
-- GRANT SELECT, INSERT, UPDATE          ON user_kms_keys     TO tktaskapp_app;
