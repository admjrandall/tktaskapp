-- 0006_audit_append_only.sql
-- Installs a BEFORE UPDATE/DELETE trigger on audit_events that raises an exception,
-- making the table append-only. This enforces NIST audit integrity requirements
-- (SP 800-92) and satisfies the EDPB Guidelines 02/2025 on audit trail immutability.
--
-- Position: must follow 0004_sync_admin_tables.sql (which creates audit_events)
-- and 0005 (which populates audit FK columns). Safe to run on any database state —
-- CREATE OR REPLACE is idempotent.

CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_events_mutation();

CREATE OR REPLACE FUNCTION prevent_kms_key_lifecycle_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'kms_key_lifecycle is append-only';
END;
$$;

DROP TRIGGER IF EXISTS kms_key_lifecycle_append_only ON kms_key_lifecycle;
CREATE TRIGGER kms_key_lifecycle_append_only
BEFORE UPDATE OR DELETE ON kms_key_lifecycle
FOR EACH ROW
EXECUTE FUNCTION prevent_kms_key_lifecycle_mutation();
