-- 0009_cursor_pagination_indexes.sql
-- Composite indexes for keyset cursor pagination on high-volume CRM tables.
--
-- Index column order: (tenant_id, deleted_at, created_at DESC, id DESC)
--   - tenant_id first: all CRM queries are tenant-scoped (RLS already set, but indexes
--     must also scope to avoid full-table scans across tenants)
--   - deleted_at: soft-delete filter is always applied; NULL rows (not-deleted) are
--     clustered together, allowing index-only scans in most cases
--   - created_at DESC, id DESC: matches the ORDER BY clause used by listCursor()
--     so Postgres can satisfy the sort without a filesort
--
-- CONCURRENTLY: safe to run against a live DB; does not lock the table.
-- IF NOT EXISTS: idempotent — safe to re-apply.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_cursor
  ON clients (tenant_id, deleted_at, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_cursor
  ON tasks (tenant_id, deleted_at, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_cursor
  ON projects (tenant_id, deleted_at, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_cursor
  ON people (tenant_id, deleted_at, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_time_entries_cursor
  ON time_entries (tenant_id, deleted_at, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communications_cursor
  ON communications (tenant_id, deleted_at, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_cursor
  ON documents (tenant_id, deleted_at, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_standalone_notes_cursor
  ON standalone_notes (tenant_id, deleted_at, created_at DESC, id DESC);
