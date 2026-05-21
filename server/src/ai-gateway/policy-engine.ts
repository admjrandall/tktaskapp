// AI gateway policy engine — interface stub.
// TODO: Implement when server-side AI governance is required.
//
// Section 11.5 — AI governance: ISO 42001:2023 alignment
//
// ISO 42001:2023 (AI management system standard) is increasingly required by enterprise
// procurement questionnaires. Before cloud AI is offered to enterprise customers, produce:
//   - AI governance policy          (docs/compliance/ai-governance-policy.md — Phase 10)
//   - Model inventory with risk classification
//   - Prompt/data boundary rules    (PII exclusion by policy, not developer discipline)
//   - AI audit trail                (prompt hash, response hash, tool calls, cost)
//   - Human approval workflow       (all write-action tool calls require user confirmation)
//
// Security requirements for all AI gateway calls:
//   1. Tenant admin must explicitly enable each provider/model — no default on.
//   2. New providers require a DPA (Data Processing Agreement) review before allowlisting.
//   3. PII field exclusion is policy-driven, not developer discipline.
//   4. Prompt hash, response hash, tool calls, tokens, and cost are logged per request.
//   5. All AI write-action tool calls require user confirmation — not bypassable by prompt.
//   6. All user-controlled fields are validated for prompt injection before inclusion
//      in any AI context.

export type AiProviderName = 'anthropic' | 'openai' | 'google' | 'azure-openai' | 'ollama'

export interface AiProviderPolicy {
  /** Tenant admin has explicitly enabled this provider. Defaults to false (deny). */
  readonly enabled: boolean
  /**
   * Approved model IDs for this provider.
   * Empty array = no models approved even if provider is enabled.
   */
  readonly approvedModels: readonly string[]
  /**
   * DPA has been reviewed and approved for this provider.
   * Provider must not be used until this is true.
   */
  readonly dpaApproved: boolean
  /** ISO 8601 date the DPA was last reviewed. */
  readonly dpaReviewedAt?: string
}

export interface TenantAiPolicy {
  readonly tenantId: string
  readonly providers: Readonly<Record<AiProviderName, AiProviderPolicy>>
  /**
   * Field names that must never be included in AI context for this tenant.
   * Applied by policy, not by individual developer discipline.
   * Examples: 'nationalInsuranceNumber', 'medicalNotes', 'salary'.
   */
  readonly excludedFields: readonly string[]
  /**
   * Require explicit user confirmation before executing any AI write-action tool call.
   * This must not be bypassable by prompt engineering.
   */
  readonly requireHumanApprovalForWrites: boolean
}

export interface AiAuditRecord {
  readonly requestId: string
  readonly tenantId: string
  readonly userId: string
  readonly provider: AiProviderName
  readonly modelId: string
  /**
   * SHA-256 of the sanitised prompt — NOT the raw prompt.
   * The raw prompt must never be logged (may contain user data).
   */
  readonly promptHash: string
  /**
   * SHA-256 of the model response — NOT the raw response.
   */
  readonly responseHash: string
  readonly toolCallsAttempted: readonly string[]
  readonly toolCallsApproved: readonly string[]
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
  readonly timestamp: Date
}

export interface AiGatewayPolicyEngine {
  /**
   * Check whether the given provider + model is approved for the tenant.
   *
   * Returns false (deny) if:
   *   - The provider is not enabled for this tenant.
   *   - The model is not in the tenant's approvedModels list.
   *   - The DPA for this provider has not been reviewed and approved.
   *   - The provider name is unknown (deny-by-default for unknown providers).
   *
   * Never throws for policy denials — returns false and logs the denial reason internally.
   */
  isProviderApproved(tenantId: string, provider: AiProviderName, modelId: string): Promise<boolean>

  /**
   * Return the set of field names excluded from AI context for this tenant.
   * Called before every prompt construction step.
   * PII exclusion is enforced by this policy layer — not left to individual callsites.
   */
  getExcludedFields(tenantId: string): Promise<readonly string[]>

  /**
   * Record a completed AI request in the append-only audit trail.
   * Called after every AI request regardless of success or failure.
   * The record stores hashes, not raw content. Never log raw prompts or responses.
   */
  recordAiRequest(record: AiAuditRecord): Promise<void>

  /**
   * Validate that a tool call is permitted before execution.
   *
   * Write-action tool calls (create, update, delete, send) require the user to have
   * explicitly confirmed the action in the current request. This confirmation must
   * originate from the UI confirmation step — it is not bypassable via prompt.
   *
   * Returns false to block the tool call.
   * Throws PolicyViolationError if the tool call violates an invariant (e.g. admin
   * tools called by non-admin role).
   */
  validateToolCall(
    tenantId: string,
    userId: string,
    toolName: string,
    userConfirmed: boolean,
  ): Promise<boolean>
}

// TODO: implement TenantAiPolicyEngine implements AiGatewayPolicyEngine
//
// TODO: server/src/ai-gateway/provider-policy.ts
//   Approved provider/model allowlist. New providers require DPA review before allowlisting.
//
// TODO: server/src/ai-gateway/data-minimisation.ts
//   excludeFieldsFromContext(record: unknown, excludedFields: readonly string[]): unknown
//   Removes excluded fields from any object before it is included in an AI prompt.
//
// TODO: server/src/ai-gateway/redaction.ts
//   redactSensitiveFields(prompt: string): string
//   Regex-based last-pass redaction for common PII patterns (e.g. NI numbers, email addresses).
//
// TODO: server/src/ai-gateway/prompt-audit.ts
//   Log prompt hash, response hash, tool calls attempted/approved, token counts, cost.
//
// TODO: server/src/ai-gateway/injection-defence.ts
//   validateField(fieldName: string, value: string): boolean
//   Validate all user-controlled fields before including them in AI context.
//
// TODO: server/src/ai-gateway/human-approval.ts
//   Enforce that write-action tool calls have a confirmed=true signal originating
//   from the UI confirmation step. Not bypassable via prompt engineering.
