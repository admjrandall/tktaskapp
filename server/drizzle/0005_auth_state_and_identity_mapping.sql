-- Auth hardening: internal org mapping boundary and durable auth state support.

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS entra_tenant_id text;

UPDATE tenant_users
  SET entra_tenant_id = COALESCE(entra_tenant_id, 'legacy-unmapped')
  WHERE entra_tenant_id IS NULL;

ALTER TABLE tenant_users
  ALTER COLUMN entra_tenant_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_entra_subject_key
  ON tenant_users (entra_tenant_id, external_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_pkce_states (
  state_hash    text        PRIMARY KEY,
  code_verifier text        NOT NULL,
  redirect_to   text        NOT NULL,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  token_hash text        PRIMARY KEY,
  status     text        NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
