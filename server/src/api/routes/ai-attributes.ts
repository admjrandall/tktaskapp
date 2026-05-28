// ── AI ATTRIBUTES ROUTE ────────────────────────────────────────────────────────
// POST /api/v1/ai/attributes/:id/compute
//   Triggers server-side AI Attribute compute for a record.
//   Validates Attribute def, routes to AI gateway, writes audit event.

import { Hono } from 'hono'
import * as v from 'valibot'
import { withTenant, writeAuditEvent } from '../../services/base.js'
import { resourcePolicyMiddleware } from '../../middleware/opa.js'
import { otel } from '../../observability/otel.js'
import type { HonoEnv } from '../../hono-types.js'
import { safeParseV } from '../../schemas/index.js'
import { describeRoute } from 'hono-openapi'
import { resolver } from '../../schemas/index.js'
import { sql } from 'drizzle-orm'
import { evaluateAiGatewayRequest } from '../../ai-gateway/policy-engine.js'
import { callLlm, LlmUnconfiguredError } from '../../ai-gateway/llm-client.js'

export const aiAttributesRouter = new Hono<HonoEnv>()

function _stringField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback = '',
): string {
  const value = record[key]
  return typeof value === 'string' ? value : fallback
}

function _objectField(
  record: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  const value = record[key]
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {}
}

// ── Request schema ────────────────────────────────────────────────────────────
const ComputeAttributeSchema = v.object({
  recordId: v.pipe(v.string(), v.uuid()),
  store: v.pipe(v.string(), v.minLength(1)),
  forceRefresh: v.optional(v.boolean(), false),
})

// ── POST /:id/compute ─────────────────────────────────────────────────────────
aiAttributesRouter.post(
  '/:id/compute',
  describeRoute({
    tags: ['AI Attributes'],
    summary: 'Compute AI attribute value for a record',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: resolver(ComputeAttributeSchema) } },
    },
    responses: {
      200: { description: 'Computed value' },
      403: { description: 'Gateway denied or HIPAA restriction' },
      404: { description: 'Attribute definition not found' },
    },
  }),
  resourcePolicyMiddleware(
    'create',
    'ai_attribute_definition',
    async (_c, tenantId, resourceId) => {
      const defRows = await withTenant(tenantId, async (tx) => {
        return tx.execute(sql`
        SELECT org_id FROM ai_attribute_definitions
        WHERE id = ${resourceId}::uuid AND org_id = ${tenantId}::uuid
        LIMIT 1
      `)
      })
      const orgId = defRows.rows[0]?.['org_id']
      return typeof orgId === 'string' ? orgId : null
    },
  ),
  async (c) => {
    const tenantId = c.get('tenantId')
    const userId = c.get('userId')
    const defId = c.req.param('id')

    try {
      const body: unknown = await c.req.json()
      const parsed = safeParseV(ComputeAttributeSchema, body)
      if (!parsed.success)
        return c.json({ error: 'Validation failed', details: parsed.issues }, 400)

      const { recordId, store, forceRefresh } = parsed.data

      // Load attribute definition from IDB-mirrored server table
      const defRows = await withTenant(tenantId, async (tx) => {
        return tx.execute(sql`
        SELECT * FROM ai_attribute_definitions
        WHERE id = ${defId}::uuid AND org_id = ${tenantId}::uuid
      `)
      })
      const def = defRows.rows[0]
      if (!def) return c.json({ error: 'Attribute definition not found' }, 404)

      // Check for HIPAA classification — server never computes HIPAA fields
      if (def['hipaa_classified'] === true) {
        return c.json({ error: 'HIPAA-classified attribute cannot be computed server-side' }, 403)
      }

      // Check existing cache unless forceRefresh
      if (!forceRefresh) {
        const cachedRows = await withTenant(tenantId, async (tx) => {
          return tx.execute(sql`
          SELECT * FROM ai_attribute_values
          WHERE def_id = ${defId}::uuid
            AND record_id = ${recordId}::uuid
            AND org_id = ${tenantId}::uuid
            AND error_state IS NULL
          ORDER BY computed_at DESC
          LIMIT 1
        `)
        })
        if (cachedRows.rows.length > 0) {
          return c.json({ value: cachedRows.rows[0], cached: true }, 200)
        }
      }

      // Load the record from the appropriate table
      const recordRows = await withTenant(tenantId, async (tx) => {
        // Dynamic store lookup via sync_documents view
        return tx.execute(sql`
        SELECT data FROM sync_documents
        WHERE id = ${recordId}::uuid
          AND store = ${store}
          AND org_id = ${tenantId}::uuid
      `)
      })
      const recordData = recordRows.rows[0]
      if (!recordData) return c.json({ error: 'Record not found' }, 404)

      // Evaluate AI gateway policy
      const prompt = _stringField(def, 'prompt')
      const model = _objectField(def, 'model')
      // Map tier to a concrete model ID for gateway allowlist check
      const modelId = _stringField(model, 'preferredModelId', 'claude-sonnet-4-6')
      const gatewayDecision = await evaluateAiGatewayRequest({
        context: {
          userId,
          orgId: tenantId,
          externalId: userId,
          email: '',
          role: 'editor',
        },
        model: modelId,
        promptTokenEstimate: Math.ceil(prompt.length / 4),
        userMessage: prompt,
      })
      if (!gatewayDecision.allowed) {
        await writeAuditEvent({
          tenantId,
          userId,
          eventType: 'ai_attribute_failed',
          resourceType: 'ai_attribute_definition',
          resourceId: defId,
          details: { reason: gatewayDecision.reason ?? 'gateway_denied', recordId },
        })
        return c.json({ error: 'AI gateway denied request', reason: gatewayDecision.reason }, 403)
      }

      const t0 = Date.now()
      const sanitisedMessage = gatewayDecision.sanitisedMessage ?? prompt
      let computedValue: string
      let inputTokens = 0
      let outputTokens = 0
      let resolvedProvider = modelId
      try {
        const llmResp = await callLlm({
          model: modelId,
          ...(_stringField(def, 'system_prompt', '')
            ? { systemPrompt: _stringField(def, 'system_prompt', '') }
            : {}),
          userMessage: sanitisedMessage,
          maxTokens: 512,
          temperature: 0,
        })
        computedValue = llmResp.content
        inputTokens = llmResp.inputTokens
        outputTokens = llmResp.outputTokens
        resolvedProvider = llmResp.provider
      } catch (err) {
        if (err instanceof LlmUnconfiguredError) {
          return c.json(
            { error: 'No AI provider configured on this server', code: 'AI_UNCONFIGURED' },
            501,
          )
        }
        throw err
      }
      const durationMs = Date.now() - t0

      // Persist computed value
      const computedAt = new Date().toISOString()
      const provenance = {
        provider: resolvedProvider,
        model: modelId,
        inputTokens,
        outputTokens,
        computeDurationMs: durationMs,
        computedAt,
      }
      await withTenant(tenantId, async (tx) => {
        await tx.execute(sql`
        INSERT INTO ai_attribute_values
          (def_id, record_id, org_id, entity_type, value, provenance, computed_at)
        VALUES (
          ${defId}::uuid, ${recordId}::uuid, ${tenantId}::uuid,
          ${_stringField(def, 'entity_type', store)},
          ${computedValue},
          ${JSON.stringify(provenance)}::jsonb,
          ${computedAt}::timestamptz
        )
        ON CONFLICT (def_id, record_id, org_id) DO UPDATE
          SET value = EXCLUDED.value,
              provenance = EXCLUDED.provenance,
              computed_at = EXCLUDED.computed_at,
              error_state = NULL
      `)
      })

      await writeAuditEvent({
        tenantId,
        userId,
        eventType: 'ai_attribute_computed',
        resourceType: 'ai_attribute_definition',
        resourceId: defId,
        details: {
          recordId,
          store,
          durationMs: String(durationMs),
          inputTokens: String(inputTokens),
          outputTokens: String(outputTokens),
        },
      })

      return c.json(
        {
          value: computedValue,
          provenance,
          cached: false,
        },
        200,
      )
    } catch (err) {
      otel.log({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'tktaskapp-server',
        tenantId,
        requestId: `ai-attributes-compute-${defId}`,
        message: 'Error computing AI attribute',
        extra: { error: String(err) },
      })
      return c.json({ error: 'Internal server error' }, 500)
    }
  },
)
