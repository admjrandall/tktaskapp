// ── SYNC ROUTES — Hono-native 3-endpoint replication protocol (C.3) ──────────
// POST /api/v1/sync/pull   — pull documents since checkpoint
// POST /api/v1/sync/push   — push local changes
// GET  /api/v1/sync/stream — SSE stream for live changes
//
// All endpoints: withTenant() + writeAuditEvent(). Never expose raw errors.

import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import { streamSSE } from 'hono/streaming'
import * as v from 'valibot'
import { getAuthStateStore } from '../../auth/state-store.js'
import { withTenant, writeAuditEvent } from '../../services/base.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { safeParseV } from '../../schemas/index.js'
import { describeRoute } from 'hono-openapi'
import { resolver } from '../../schemas/index.js'
import { sql } from 'drizzle-orm'

export const syncRouter = new Hono<HonoEnv>()

const STREAM_TICKET_TTL_SECONDS = 60

// ── Wire document shape (C.3) ─────────────────────────────────────────────────
interface DocWithRev {
  id: string
  store: string
  rev: string
  data: Record<string, unknown>
  _deleted?: boolean
  updatedAt: string
}

// ── Request schemas ───────────────────────────────────────────────────────────
const PullSchema = v.object({
  checkpoint: v.optional(v.unknown(), null),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)), 100),
})

const PushRowSchema = v.object({
  newDocumentState: v.record(v.string(), v.unknown()),
  assumedMasterState: v.optional(v.record(v.string(), v.unknown())),
})

const PushSchema = v.object({
  changeRows: v.array(PushRowSchema),
})

// ── POST /stream-ticket ──────────────────────────────────────────────────────
syncRouter.post(
  '/stream-ticket',
  describeRoute({
    tags: ['Sync'],
    summary: 'Issue SSE stream ticket',
    responses: { 201: { description: 'Ticket issued' } },
  }),
  opaMiddleware('sync:stream'),
  async (c) => {
    const ticket = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + STREAM_TICKET_TTL_SECONDS * 1000
    const store = await getAuthStateStore()

    await store.saveStreamTicket(
      ticket,
      {
        userId: c.get('userId'),
        tenantId: c.get('tenantId'),
        role: c.get('role'),
        externalId: c.get('externalId'),
        email: c.get('email'),
        expiresAt,
      },
      STREAM_TICKET_TTL_SECONDS,
    )

    c.header('Cache-Control', 'no-store')
    return c.json({ ticket, expiresAt }, 201)
  },
)

// ── Revision generation ───────────────────────────────────────────────────────
function _makeRev(): string {
  return `${Date.now()}-${randomBytes(16).toString('base64url')}`
}

function _recordString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback = '',
): string {
  const value = record[key]
  return typeof value === 'string' ? value : fallback
}

function _timestampString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' && value.length > 0 ? value : null
}

// ── POST /pull ────────────────────────────────────────────────────────────────
syncRouter.post(
  '/pull',
  describeRoute({
    tags: ['Sync'],
    summary: 'Pull changed documents since checkpoint',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(PullSchema) } },
    },
    responses: { 200: { description: 'Documents and new checkpoint' } },
  }),
  opaMiddleware('read'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const body: unknown = await c.req.json()
      const parsed = safeParseV(PullSchema, body)
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)

      const { checkpoint, limit } = parsed.data
      const sinceTs =
        checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint)
          ? _recordString(checkpoint as Record<string, unknown>, 'ts', '1970-01-01T00:00:00.000Z')
          : '1970-01-01T00:00:00.000Z'

      // Pull changed records from all CRM tables since checkpoint
      const documents = await withTenant(tenantId, async (tx) => {
        // Query the generic sync_documents view (all CRM entities with updatedAt)
        const rows = await tx.execute(sql`
        SELECT id, store, rev, data, deleted AS "_deleted", updated_at AS "updatedAt"
        FROM sync_documents
        WHERE org_id = ${tenantId}::uuid
          AND updated_at > ${sinceTs}::timestamptz
        ORDER BY updated_at ASC
        LIMIT ${limit}
      `)
        return rows.rows as unknown as DocWithRev[]
      })

      const lastDocument = documents[documents.length - 1]
      const newCheckpoint = lastDocument ? { ts: lastDocument.updatedAt } : { ts: sinceTs }

      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'sync_pull',
        details: { count: String(documents.length), checkpoint: JSON.stringify(newCheckpoint) },
      })

      return c.json({ documents, checkpoint: newCheckpoint }, 200)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'sync-pull',
        message: 'Error during sync pull',
        extra: { error: String(err) },
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

// ── POST /push ────────────────────────────────────────────────────────────────
syncRouter.post(
  '/push',
  describeRoute({
    tags: ['Sync'],
    summary: 'Push local changes to server',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(PushSchema) } },
    },
    responses: { 200: { description: 'Conflicts list' } },
  }),
  opaMiddleware('create'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    try {
      const body: unknown = await c.req.json()
      const parsed = safeParseV(PushSchema, body)
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)

      const conflicts: Record<string, unknown>[] = []

      await withTenant(tenantId, async (tx) => {
        for (const row of parsed.data.changeRows) {
          const doc = row.newDocumentState
          const id = _recordString(doc, 'id')
          const store = _recordString(doc, 'store')
          if (!id || !store) continue

          // Conflict check: if server's updatedAt is newer than assumed master
          if (row.assumedMasterState) {
            const assumed = row.assumedMasterState
            const serverRow = await tx.execute(sql`
            SELECT updated_at FROM sync_documents
            WHERE id = ${id}::uuid AND store = ${store} AND org_id = ${tenantId}::uuid
          `)
            const serverTs = _timestampString(serverRow.rows[0]?.['updated_at'])
            const assumedTs = _timestampString(assumed['updatedAt'])
            if (serverTs !== null && assumedTs !== null && serverTs > assumedTs) {
              conflicts.push(doc)
              continue
            }
          }

          const rev = _makeRev()
          const deletedAt = doc['_deleted'] ? new Date().toISOString() : null
          await tx.execute(sql`
          INSERT INTO sync_documents (id, org_id, store, rev, data, deleted, updated_at)
          VALUES (
            ${id}::uuid, ${tenantId}::uuid, ${store}, ${rev},
            ${JSON.stringify(doc)}::jsonb,
            ${deletedAt !== null},
            NOW()
          )
          ON CONFLICT (id, store, org_id) DO UPDATE
            SET rev = EXCLUDED.rev,
                data = EXCLUDED.data,
                deleted = EXCLUDED.deleted,
                updated_at = EXCLUDED.updated_at
        `)
        }
      })

      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'sync_push',
        details: {
          pushed: String(parsed.data.changeRows.length),
          conflicts: String(conflicts.length),
        },
      })

      return c.json({ conflicts }, 200)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'sync-push',
        message: 'Error during sync push',
        extra: { error: String(err) },
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

// ── GET /stream (SSE) ─────────────────────────────────────────────────────────
syncRouter.get(
  '/stream',
  describeRoute({
    tags: ['Sync'],
    summary: 'SSE live change stream',
    responses: { 200: { description: 'text/event-stream' } },
  }),
  opaMiddleware('sync:stream'),
  (c) => {
    const tenantId = c.get('tenantId')
    return streamSSE(c, async (stream) => {
      // Poll every 30s and emit any documents changed since last checkpoint
      let lastTs = new Date().toISOString()
      while (!stream.closed) {
        try {
          const rows = await withTenant(tenantId, async (tx) => {
            const result = await tx.execute(sql`
            SELECT id, store, rev, data, deleted AS "_deleted", updated_at AS "updatedAt"
            FROM sync_documents
            WHERE org_id = ${tenantId}::uuid
              AND updated_at > ${lastTs}::timestamptz
            ORDER BY updated_at ASC
            LIMIT 200
          `)
            return result.rows as unknown as DocWithRev[]
          })
          if (rows.length > 0) {
            const lastRow = rows[rows.length - 1]
            if (!lastRow) continue
            lastTs = lastRow.updatedAt
            const checkpoint = { ts: lastTs }
            await stream.writeSSE({
              data: JSON.stringify({ documents: rows, checkpoint }),
              event: 'sync',
            })
          }
        } catch {
          /* ignore transient errors — client will reconnect */
        }
        await stream.sleep(30_000)
      }
    })
  },
)
