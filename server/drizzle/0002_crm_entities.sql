-- 0002_crm_entities.sql
-- Enables Row-Level Security on all CRM entity tables and adds the
-- KMS key-lifecycle append-only trigger.
--
-- Position: must follow 0001_rls_policies.sql (which enables RLS on tenant_users
-- and user_kms_keys). All CRM tables reference tenant_users via FK, so tenant_users
-- must be secured first. The KMS trigger in this file also references user_kms_keys.

-- ── clients ──────────────────────────────────────────────────────────────────

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON clients
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON clients
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── departments ───────────────────────────────────────────────────────────────

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON departments
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON departments
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── projects ──────────────────────────────────────────────────────────────────

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON projects
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON projects
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── tasks ─────────────────────────────────────────────────────────────────────

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tasks
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON tasks
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── people ────────────────────────────────────────────────────────────────────

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE people FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON people
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON people
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── tags ──────────────────────────────────────────────────────────────────────

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tags
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON tags
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── communications ────────────────────────────────────────────────────────────

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON communications
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON communications
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── time_entries ──────────────────────────────────────────────────────────────

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON time_entries
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON time_entries
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── notifications ─────────────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON notifications
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON notifications
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── files ─────────────────────────────────────────────────────────────────────

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON files
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON files
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── documents ─────────────────────────────────────────────────────────────────

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON documents
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── standalone_notes ──────────────────────────────────────────────────────────

ALTER TABLE standalone_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE standalone_notes FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON standalone_notes
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON standalone_notes
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── conversations ─────────────────────────────────────────────────────────────

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON conversations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── legal_holds ───────────────────────────────────────────────────────────────

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_holds FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON legal_holds
  USING (tenant_id = current_setting('app.tenant_id', true)::text);

CREATE POLICY tenant_insert ON legal_holds
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::text);

-- ── kms_key_lifecycle: append-only trigger ────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_kms_key_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'kms_key_lifecycle is append-only';
END;
$$;

CREATE TRIGGER kms_key_lifecycle_append_only
  BEFORE UPDATE OR DELETE ON kms_key_lifecycle
  FOR EACH ROW EXECUTE FUNCTION prevent_kms_key_update();

-- ── Application role grants ───────────────────────────────────────────────────
-- Run once per environment. Replace 'tktaskapp_app' with your PostgreSQL role.

-- GRANT SELECT, INSERT, UPDATE, DELETE ON clients           TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON departments       TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON projects          TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tasks             TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON people            TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tags              TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON communications    TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON time_entries      TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON notifications     TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON files             TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON documents         TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON standalone_notes  TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON conversations     TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON legal_holds       TO tktaskapp_app;
