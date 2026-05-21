export interface BuildProfile {
  /** Machine-readable identifier — must be unique across all profiles. */
  id: string
  /** Human-readable label shown in logs and release artifacts. */
  displayName: string
  /** Whether the bundle may open connections to the public internet. */
  allowExternalNetwork: boolean
  /** Whether Anthropic / OpenAI / Google cloud AI providers are enabled. */
  allowCloudAI: boolean
  /** Whether a local Ollama endpoint is permitted at runtime. */
  allowOllama: boolean
  /** Whether the browser built-in AI (Gemini Nano / Phi-4-mini) is permitted. */
  allowBrowserNano: boolean
  /** Coarse AI mode label consumed by build tooling and CSP generation. */
  aiMode: 'none' | 'browser' | 'internal' | 'cloud'
  /** Sync/storage adapter that will be wired at app entry. */
  adapter: string
  /** Primary storage mechanism. */
  storage: string
  /** CSP profile key — resolved to actual directives by generate-csp.mjs. */
  csp: string
  /** Whether a running server is required for the profile to function. */
  requireServer: boolean
  /**
   * GDPR Article 17 erasure approach for this profile.
   * 'local-vault-delete'    — delete the encrypted vault blob (offline only).
   * 'kms-crypto-shredding'  — destroy the per-user KMS key; ciphertext becomes unreadable.
   * 'dataverse-managed'     — erasure delegated to Dataverse / Microsoft compliance controls.
   */
  gdprErasureModel: 'local-vault-delete' | 'kms-crypto-shredding' | 'dataverse-managed'
  /** Whether a KMS adapter is required before this profile is production-capable. */
  kmsRequired: boolean
  /** Minimum accessibility standard required for this profile's UI. */
  accessibilityTarget: 'WCAG-2.2-AA' | 'WCAG-2.2-AAA'
}
