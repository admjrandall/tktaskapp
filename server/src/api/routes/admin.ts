import { Hono } from 'hono'
import * as v from 'valibot'
import { usersService } from '../../services/users.service.js'
import { opaMiddleware, resourcePolicyMiddleware } from '../../middleware/opa.js'
import { requireStepUp } from '../../auth/step-up.js'
import { otel } from '../../observability/otel.js'
import { LegalHoldService } from '../../kms/legal-hold.js'
import { LegalHoldActiveError, getKmsService } from '../../kms/key-service.js'
import { withTenant, writeAuditEvent } from '../../services/base.js'
import type { HonoEnv } from '../../hono-types.js'
import { EraseUserSchema, safeParseV } from '../../schemas/index.js'
import { sql } from 'drizzle-orm'

// ── Admin-only Valibot schemas ─────────────────────────────────────────────────
const OrgSettingsUpdateSchema = v.object({
  lockdownLevel: v.optional(v.picklist(['off', 'standard', 'strong', 'strict'])),
  retentionDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(365))),
  compliancePacks: v.optional(v.array(v.picklist(['hipaa', 'eu-ai-act', 'gdpr', 'soc2']))),
})

const AIAllowlistAddSchema = v.object({
  provider: v.pipe(v.string(), v.minLength(1)),
  modelId: v.pipe(v.string(), v.minLength(1)),
  reason: v.pipe(v.string(), v.minLength(1)),
})

const IntegrationAddSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  type: v.pipe(v.string(), v.minLength(1)),
  config: v.record(v.string(), v.unknown()),
})

const LegalHoldPlaceSchema = v.object({
  userId: v.pipe(v.string(), v.minLength(1)),
  reason: v.pipe(v.string(), v.minLength(1)),
  expiresAt: v.optional(v.pipe(v.string(), v.isoDateTime())),
})

const legalHoldService = new LegalHoldService()

export const adminRouter = new Hono<HonoEnv>()

adminRouter.get('/users', opaMiddleware('manage_users'), async (c) => {
  const tenantId = c.get('tenantId')
  try {
    const { page, pageSize, status } = c.req.query()
    return c.json(
      await usersService.list(tenantId, {
        ...(status !== undefined ? { status } : {}),
        ...(page !== undefined ? { page: Number(page) } : {}),
        ...(pageSize !== undefined ? { pageSize: Number(pageSize) } : {}),
      }),
      200,
    )
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'admin-users-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

adminRouter.get(
  '/users/:id',
  resourcePolicyMiddleware('manage_users', 'users', async (_c, tenantId, resourceId) => {
    const user = await usersService.getById(tenantId, resourceId)
    return user?.orgId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    try {
      const user = await usersService.getById(tenantId, c.req.param('id'))
      return user ? c.json(user, 200) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-users-get',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

adminRouter.post(
  '/users/:id/suspend',
  resourcePolicyMiddleware('suspend_user', 'users', async (_c, tenantId, resourceId) => {
    const user = await usersService.getById(tenantId, resourceId)
    return user?.orgId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const requestedBy = c.get('userId')
    const targetId = c.req.param('id')
    try {
      const ok = await usersService.suspend(tenantId, requestedBy, targetId)
      return ok ? c.body(null, 204) : c.json({ error: 'Not found' }, 404)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-suspend',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

adminRouter.post(
  '/users/:id/erase',
  requireStepUp('gdpr_erase'),
  resourcePolicyMiddleware('erase_user', 'users', async (_c, tenantId, resourceId) => {
    const user = await usersService.getById(tenantId, resourceId)
    return user?.orgId ?? null
  }),
  async (c) => {
    const tenantId = c.get('tenantId')
    const requestedBy = c.get('userId')
    const targetId = c.req.param('id')

    try {
      const parsed = safeParseV(EraseUserSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)

      const onHold = await legalHoldService.isUserOnHold(tenantId, targetId)
      if (onHold) {
        return c.json(
          {
            error: 'Legal hold is active — erasure cannot be scheduled',
            code: 'LEGAL_HOLD_ACTIVE',
          },
          409,
        )
      }

      try {
        const kmsService = getKmsService()
        await kmsService.scheduleKeyDestruction(targetId, tenantId, new Date(parsed.data.destroyAt))
      } catch (kmsErr) {
        if (
          kmsErr instanceof Error &&
          (kmsErr.message.includes('AZURE_KV_URL') || kmsErr.message.includes('AWS_REGION'))
        ) {
          return c.json({ error: 'KMS provider not configured on this server' }, 503)
        }
        throw kmsErr
      }

      const auditEventId = await writeAuditEvent({
        tenantId,
        userId: requestedBy,
        eventType: 'gdpr_erasure_requested',
        resourceType: 'users',
        resourceId: targetId,
        details: { destroyAt: parsed.data.destroyAt, reason: parsed.data.reason ?? 'DSAR' },
      })

      return c.json({ userId: targetId, destroyAt: parsed.data.destroyAt, auditEventId }, 202)
    } catch (err) {
      if (err instanceof LegalHoldActiveError) {
        return c.json({ error: 'Legal hold is active', code: 'LEGAL_HOLD_ACTIVE' }, 409)
      }
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-erase',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

// ── Org settings ───────────────────────────────────────────────────────────────
adminRouter.get('/org-settings', opaMiddleware('manage_users'), async (c) => {
  const tenantId = c.get('tenantId')
  const role = c.get('role')
  if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
  try {
    const rows = await withTenant(tenantId, async (tx) => {
      return tx.execute(sql`SELECT * FROM org_settings WHERE org_id = ${tenantId}::uuid LIMIT 1`)
    })
    return c.json(
      rows.rows[0] ?? { lockdownLevel: 'off', retentionDays: 2190, compliancePacks: [] },
      200,
    )
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'admin-org-settings-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

adminRouter.patch(
  '/org-settings',
  opaMiddleware('manage_org_settings'),
  requireStepUp('org_settings_change'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    const role = c.get('role')
    if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
    try {
      const parsed = safeParseV(OrgSettingsUpdateSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const { lockdownLevel, retentionDays, compliancePacks } = parsed.data
      await withTenant(tenantId, async (tx) => {
        await tx.execute(sql`
        INSERT INTO org_settings (org_id, lockdown_level, retention_days, compliance_packs)
        VALUES (${tenantId}::uuid, ${lockdownLevel ?? 'off'}, ${retentionDays ?? 2190}, ${JSON.stringify(compliancePacks ?? [])}::jsonb)
        ON CONFLICT (org_id) DO UPDATE
          SET lockdown_level   = COALESCE(EXCLUDED.lockdown_level, org_settings.lockdown_level),
              retention_days   = COALESCE(EXCLUDED.retention_days, org_settings.retention_days),
              compliance_packs = COALESCE(EXCLUDED.compliance_packs, org_settings.compliance_packs),
              updated_at       = NOW()
      `)
      })
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'org_settings_updated',
        details: {
          lockdownLevel,
          retentionDays: String(retentionDays),
          compliancePacks: JSON.stringify(compliancePacks),
        },
      })
      return c.body(null, 204)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-org-settings-patch',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

// ── AI endpoint allowlist ──────────────────────────────────────────────────────
adminRouter.get('/ai-allowlist', opaMiddleware('manage_users'), async (c) => {
  const tenantId = c.get('tenantId')
  const role = c.get('role')
  if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
  try {
    const rows = await withTenant(tenantId, async (tx) => {
      return tx.execute(
        sql`SELECT * FROM ai_endpoint_allowlist WHERE org_id = ${tenantId}::uuid ORDER BY created_at DESC`,
      )
    })
    return c.json(rows.rows, 200)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'admin-ai-allowlist-get',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

adminRouter.post(
  '/ai-allowlist',
  opaMiddleware('manage_ai_allowlist'),
  requireStepUp('ai_provider_configure'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    const role = c.get('role')
    if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
    try {
      const parsed = safeParseV(AIAllowlistAddSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const id = crypto.randomUUID()
      await withTenant(tenantId, async (tx) => {
        await tx.execute(sql`
        INSERT INTO ai_endpoint_allowlist (id, org_id, provider, model_id, reason, created_by)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${parsed.data.provider}, ${parsed.data.modelId}, ${parsed.data.reason}, ${userId}::uuid)
      `)
      })
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'ai_allowlist_entry_added',
        resourceType: 'ai_endpoint_allowlist',
        resourceId: id,
        details: { provider: parsed.data.provider, modelId: parsed.data.modelId },
      })
      return c.json({ id }, 201)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-ai-allowlist-add',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

adminRouter.delete(
  '/ai-allowlist/:id',
  opaMiddleware('manage_ai_allowlist'),
  requireStepUp('ai_provider_configure'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    const role = c.get('role')
    const entryId = c.req.param('id')
    if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
    try {
      await withTenant(tenantId, async (tx) => {
        await tx.execute(
          sql`DELETE FROM ai_endpoint_allowlist WHERE id = ${entryId}::uuid AND org_id = ${tenantId}::uuid`,
        )
      })
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'ai_allowlist_entry_removed',
        resourceType: 'ai_endpoint_allowlist',
        resourceId: entryId,
      })
      return c.body(null, 204)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-ai-allowlist-del',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

// ── Integration manager ────────────────────────────────────────────────────────
adminRouter.get('/integrations', opaMiddleware('manage_users'), async (c) => {
  const tenantId = c.get('tenantId')
  const role = c.get('role')
  if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
  try {
    const rows = await withTenant(tenantId, async (tx) => {
      return tx.execute(
        sql`SELECT id, name, type, created_at FROM integrations WHERE org_id = ${tenantId}::uuid ORDER BY created_at DESC`,
      )
    })
    return c.json(rows.rows, 200)
  } catch (err) {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'admin-integrations-list',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

adminRouter.post(
  '/integrations',
  opaMiddleware('manage_integrations'),
  requireStepUp('org_settings_change'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    const role = c.get('role')
    if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
    try {
      const parsed = safeParseV(IntegrationAddSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const id = crypto.randomUUID()
      await withTenant(tenantId, async (tx) => {
        await tx.execute(sql`
        INSERT INTO integrations (id, org_id, name, type, config, created_by)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${parsed.data.name}, ${parsed.data.type}, ${JSON.stringify(parsed.data.config)}::jsonb, ${userId}::uuid)
      `)
      })
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'integration_registered',
        resourceType: 'integrations',
        resourceId: id,
        details: { name: parsed.data.name, type: parsed.data.type },
      })
      return c.json({ id }, 201)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-integrations-add',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

adminRouter.delete(
  '/integrations/:id',
  opaMiddleware('manage_integrations'),
  requireStepUp('org_settings_change'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    const role = c.get('role')
    const integrationId = c.req.param('id')
    if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
    try {
      await withTenant(tenantId, async (tx) => {
        await tx.execute(
          sql`DELETE FROM integrations WHERE id = ${integrationId}::uuid AND org_id = ${tenantId}::uuid`,
        )
      })
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'integration_removed',
        resourceType: 'integrations',
        resourceId: integrationId,
      })
      return c.body(null, 204)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-integrations-del',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

// ── Legal hold management ──────────────────────────────────────────────────────

adminRouter.post(
  '/legal-holds',
  opaMiddleware('manage_users'),
  requireStepUp('legal_hold_change'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    const role = c.get('role')
    if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
    try {
      const parsed = safeParseV(LegalHoldPlaceSchema, await c.req.json())
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)
      const holdId = await legalHoldService.placeHold(
        parsed.data.userId,
        tenantId,
        parsed.data.reason,
        parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        userId,
      )
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'legal_hold_placed',
        resourceType: 'users',
        resourceId: parsed.data.userId,
        details: { reason: parsed.data.reason, holdId },
      })
      return c.json({ holdId }, 201)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-legal-hold-place',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

adminRouter.delete(
  '/legal-holds/:holdId',
  opaMiddleware('manage_users'),
  requireStepUp('legal_hold_change'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    const role = c.get('role')
    const holdId = c.req.param('holdId')
    if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
    try {
      await legalHoldService.liftHold(tenantId, holdId, userId)
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'legal_hold_lifted',
        resourceType: 'legal_holds',
        resourceId: holdId,
      })
      return c.body(null, 204)
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-legal-hold-lift',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)

// ── KMS key management ─────────────────────────────────────────────────────────

adminRouter.get('/kms/keys/:userId', opaMiddleware('manage_users'), async (c) => {
  const tenantId = c.get('tenantId')
  const role = c.get('role')
  if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
  try {
    const kmsService = getKmsService()
    const status = await kmsService.getKeyStatus(c.req.param('userId'), tenantId)
    return c.json({ userId: c.req.param('userId'), status }, 200)
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('AZURE_KV_URL') || err.message.includes('AWS_REGION'))
    ) {
      return c.json({ error: 'KMS provider not configured on this server' }, 503)
    }
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'tktaskapp-server',
      tenantId,
      requestId: 'admin-kms-status',
      message: String(err),
    })
    return c.json({ error: 'Internal server error' }, 500)
  }
})

adminRouter.post(
  '/kms/keys/:userId/finalize-destruction',
  opaMiddleware('manage_users'),
  requireStepUp('kms_key_manage'),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    const role = c.get('role')
    const targetUserId = c.req.param('userId')
    if (role !== 'admin' && role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
    try {
      const kmsService = getKmsService()
      const currentStatus = await kmsService.getKeyStatus(targetUserId, tenantId)
      if (currentStatus !== 'scheduled-for-destruction') {
        return c.json(
          {
            error: 'Key is not scheduled for destruction',
            status: currentStatus,
            code: 'KEY_NOT_SCHEDULED',
          },
          409,
        )
      }
      await kmsService.deleteKey(targetUserId, tenantId)
      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'kms_key.force_destroyed',
        resourceType: 'users',
        resourceId: targetUserId,
      })
      return c.body(null, 204)
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('AZURE_KV_URL') || err.message.includes('AWS_REGION'))
      ) {
        return c.json({ error: 'KMS provider not configured on this server' }, 503)
      }
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: 'admin-kms-force-destroy',
        message: String(err),
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)
