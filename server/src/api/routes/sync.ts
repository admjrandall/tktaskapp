// ── SYNC ROUTES — Hono-native 3-endpoint replication protocol (C.3) ──────────
// POST /api/v1/sync/pull   — pull documents since checkpoint
// POST /api/v1/sync/push   — push local changes
// GET  /api/v1/sync/stream — SSE stream for live changes
//
// All endpoints: withTenant() + writeAuditEvent(). Never expose raw errors.

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import * as v from 'valibot'
import { withTenant, writeAuditEvent } from '../../services/base.js'
import { opaMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { safeParseV } from '../../schemas/index.js'
import { db } from '../../db/index.js'
import { sql } from 'drizzle-orm'

export const syncRouter = new Hono<HonoEnv>()

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

// ── Revision generation ───────────────────────────────────────────────────────
function _makeRev(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ── POST /pull ────────────────────────────────────────────────────────────────
syncRouter.post('/pull', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const body = await c.req.json()
    const parsed = safeParseV(PullSchema, body)
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)

    const { checkpoint, limit } = parsed.data
    const sinceTs = checkpoint
      ? String((checkpoint as Record<string, unknown>)['ts'] ?? '1970-01-01T00:00:00.000Z')
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

    const newCheckpoint =
      documents.length > 0 ? { ts: documents[documents.length - 1]!.updatedAt } : { ts: sinceTs }

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
})

// ── POST /push ────────────────────────────────────────────────────────────────
syncRouter.post('/push', opaMiddleware('create'), async (c) => {
  const tenantId = c.get('tenantId') as string
  const userId = c.get('userId') as string
  try {
    const body = await c.req.json()
    const parsed = safeParseV(PushSchema, body)
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.issues }, 400)

    const conflicts: Record<string, unknown>[] = []

    await withTenant(tenantId, async (tx) => {
      for (const row of parsed.data.changeRows) {
        const doc = row.newDocumentState as Record<string, unknown>
        const id = String(doc['id'] ?? '')
        const store = String(doc['store'] ?? '')
        if (!id || !store) continue

        // Conflict check: if server's updatedAt is newer than assumed master
        if (row.assumedMasterState) {
          const assumed = row.assumedMasterState as Record<string, unknown>
          const serverRow = await tx.execute(sql`
            SELECT updated_at FROM sync_documents
            WHERE id = ${id}::uuid AND store = ${store} AND org_id = ${tenantId}::uuid
          `)
          const serverTs = (serverRow.rows[0] as Record<string, unknown> | undefined)?.[
            'updated_at'
          ]
          const assumedTs = assumed['updatedAt']
          if (serverTs && assumedTs && String(serverTs) > String(assumedTs)) {
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
})

// ── GET /stream (SSE) ─────────────────────────────────────────────────────────
syncRouter.get('/stream', opaMiddleware('read'), async (c) => {
  const tenantId = c.get('tenantId') as string
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
          lastTs = rows[rows.length - 1]!.updatedAt
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
})
