// Minimal ambient type declarations for server-side packages listed in server/package.json.
// These declarations allow TypeScript (running from the root tsconfig) to type-check
// the server source files before the packages are installed in the workspace.
// When these packages are installed, TypeScript will prefer their own types over these.
// Do NOT import this file explicitly — it is picked up via the root tsconfig include glob.

// ── jose ─────────────────────────────────────────────────────────────────────
declare module 'jose' {
  export interface RemoteJWKSetOptions {
    cacheMaxAge?: number
    cooldownDuration?: number
  }
  export type GetKeyFunction = (...args: unknown[]) => Promise<unknown>
  export function createRemoteJWKSet(url: URL, options?: RemoteJWKSetOptions): GetKeyFunction
  export interface JWTVerifyOptions {
    issuer?: string | string[]
    audience?: string | string[]
    algorithms?: string[]
    maxTokenAge?: string | number
  }
  export interface JWTPayload {
    iss?: string
    sub?: string
    aud?: string | string[]
    exp?: number
    iat?: number
    [key: string]: unknown
  }
  export interface JWTVerifyResult {
    payload: JWTPayload
    protectedHeader: Record<string, unknown>
  }
  export function jwtVerify(
    jwt: string,
    key: GetKeyFunction,
    options?: JWTVerifyOptions,
  ): Promise<JWTVerifyResult>
}

// ── @azure/identity ───────────────────────────────────────────────────────────
declare module '@azure/identity' {
  export interface TokenCredential {
    getToken(
      scopes: string | string[],
      options?: Record<string, unknown>,
    ): Promise<{ token: string; expiresOnTimestamp: number } | null>
  }
  export class DefaultAzureCredential implements TokenCredential {
    constructor(options?: Record<string, unknown>)
    getToken(
      scopes: string | string[],
      options?: Record<string, unknown>,
    ): Promise<{ token: string; expiresOnTimestamp: number } | null>
  }
  export class ManagedIdentityCredential implements TokenCredential {
    constructor(clientId?: string)
    getToken(
      scopes: string | string[],
      options?: Record<string, unknown>,
    ): Promise<{ token: string; expiresOnTimestamp: number } | null>
  }
}

// ── @azure/keyvault-keys ──────────────────────────────────────────────────────
declare module '@azure/keyvault-keys' {
  import type { TokenCredential } from '@azure/identity'

  export interface JsonWebKey {
    kid?: string
    kty?: string
    n?: Uint8Array
    e?: Uint8Array
  }
  export interface KeyVaultKey {
    id?: string
    name: string
    key?: JsonWebKey
    keyType?: string
    keyOperations?: string[]
    properties: {
      id?: string
      name: string
      vaultUrl: string
      version?: string
      enabled?: boolean
      createdOn?: Date
    }
  }
  export interface CreateKeyOptions {
    keySize?: number
    keyOperations?: string[]
    enabled?: boolean
    expiresOn?: Date
  }
  export interface WrapResult {
    result: Uint8Array
    algorithm: string
    keyID?: string
  }
  export interface UnwrapResult {
    result: Uint8Array
    algorithm: string
    keyID?: string
  }
  export class KeyClient {
    constructor(vaultUrl: string, credential: TokenCredential)
    createKey(
      name: string,
      keyType: 'RSA' | 'EC' | 'RSA-HSM' | 'EC-HSM' | 'oct' | 'oct-HSM',
      options?: CreateKeyOptions,
    ): Promise<KeyVaultKey>
    getKey(name: string, options?: { version?: string }): Promise<KeyVaultKey>
    beginDeleteKey(name: string): Promise<{
      pollUntilDone(): Promise<KeyVaultKey>
    }>
    purgeDeletedKey(name: string): Promise<void>
  }
  export class CryptographyClient {
    constructor(keyId: string, credential: TokenCredential)
    wrapKey(algorithm: 'RSA-OAEP' | 'RSA-OAEP-256' | 'A256KW', key: Uint8Array): Promise<WrapResult>
    unwrapKey(
      algorithm: 'RSA-OAEP' | 'RSA-OAEP-256' | 'A256KW',
      encryptedKey: Uint8Array,
    ): Promise<UnwrapResult>
  }
}

// ── @opentelemetry/sdk-node ───────────────────────────────────────────────────
declare module '@opentelemetry/sdk-node' {
  export interface NodeSDKConfiguration {
    serviceName?: string
    serviceVersion?: string
    traceExporter?: unknown
    metricReader?: unknown
    instrumentations?: unknown[]
    resource?: unknown
  }
  export class NodeSDK {
    constructor(config?: NodeSDKConfiguration)
    start(): void
    shutdown(): Promise<void>
  }
}

// ── @opentelemetry/auto-instrumentations-node ─────────────────────────────────
declare module '@opentelemetry/auto-instrumentations-node' {
  export function getNodeAutoInstrumentations(config?: Record<string, unknown>): unknown[]
}

// ── @opentelemetry/exporter-trace-otlp-grpc ──────────────────────────────────
declare module '@opentelemetry/exporter-trace-otlp-grpc' {
  export interface OTLPExporterNodeConfigBase {
    url?: string
    headers?: Record<string, string>
    timeoutMillis?: number
  }
  export class OTLPTraceExporter {
    constructor(config?: OTLPExporterNodeConfigBase)
    shutdown(): Promise<void>
  }
}

// ── @opentelemetry/exporter-metrics-otlp-grpc ────────────────────────────────
declare module '@opentelemetry/exporter-metrics-otlp-grpc' {
  export interface OTLPExporterNodeConfigBase {
    url?: string
    headers?: Record<string, string>
    timeoutMillis?: number
  }
  export class OTLPMetricExporter {
    constructor(config?: OTLPExporterNodeConfigBase)
    shutdown(): Promise<void>
  }
}
