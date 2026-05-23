-- Phase 4 C.6: audit chain integrity constraint
-- Adds UNIQUE (org_id, chain_position) per the C.6 contract.
-- Run after 0002_crm_entities.sql on existing databases.
--
-- prevHash and signedDigest remain nullable to support server-side audit writes
-- that do not yet compute hash-chain values.  When a server-side chain writer
-- is added (future phase), run:
--   ALTER TABLE audit_events ALTER COLUMN signed_digest SET NOT NULL;
--   with a backfill migration for existing rows first.

-- UNIQUE (org_id, chain_position) — enforces per-tenant chain order per C.6.
-- bigserial is globally auto-incrementing so this also prevents application-layer
-- bugs that could emit duplicate per-tenant positions.
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_org_chain_pos_key UNIQUE (org_id, chain_position);
