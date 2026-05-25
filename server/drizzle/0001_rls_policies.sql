-- 0001_rls_policies.sql
-- Row-level security for user-scoped tables (tenant_users, user_kms_keys).
-- Must run before 0002_crm_entities.sql which populates dependent FK rows.
--
-- These tables use org_id (UUID) as the tenant discriminator. The app role sets
-- both app.tenant_id (text) and app.org_id (uuid) via withTenant() for every
-- request, so both settings are always available.

-- ── tenant_users ──────────────────────────────────────────────────────────────
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenant_users
  AS RESTRICTIVE
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY tenant_insert ON tenant_users
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- ── user_kms_keys ─────────────────────────────────────────────────────────────
ALTER TABLE user_kms_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_kms_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_kms_keys
  AS RESTRICTIVE
  USING (org_id = current_setting('app.org_id', true)::uuid);

CREATE POLICY tenant_insert ON user_kms_keys
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

-- ── Index coverage (required for O(1) RLS filter) ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenant_users_org_id ON tenant_users (org_id);
CREATE INDEX IF NOT EXISTS idx_user_kms_keys_org_id ON user_kms_keys (org_id);

-- ── Application role grants ───────────────────────────────────────────────────
-- Run once per environment. Replace 'tktaskapp_app' with your PostgreSQL role.
-- The role must NOT be the table owner — otherwise FORCE ROW LEVEL SECURITY
-- would still be bypassed by superuser privileges.
--
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_users  TO tktaskapp_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON user_kms_keys TO tktaskapp_app;
