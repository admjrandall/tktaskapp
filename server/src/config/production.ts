const REQUIRED_PRODUCTION_ENV = [
  'DATABASE_URL',
  'ENTRA_CLIENT_ID',
  'ENTRA_TENANT_ID',
  'OIDC_REDIRECT_URI',
  'ALLOW_ORIGINS',
  'AUTH_STATE_REDIS_URL',
  'AI_GATEWAY_REDIS_URL',
  'AZURE_KV_URL',
] as const

export function validateProductionConfig(): void {
  if (process.env['NODE_ENV'] !== 'production') return

  const missing = REQUIRED_PRODUCTION_ENV.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) {
    throw new Error(`Missing required production configuration: ${missing.join(', ')}`)
  }

  const origins = process.env['ALLOW_ORIGINS'] ?? ''
  if (origins.includes('*')) {
    throw new Error('ALLOW_ORIGINS must not contain wildcards in production')
  }

  const cspConnectSrc = process.env['ENTERPRISE_CSP_CONNECT_SRC'] ?? ''
  if (cspConnectSrc.includes('*')) {
    throw new Error('ENTERPRISE_CSP_CONNECT_SRC must not contain wildcards in production')
  }

  const redirect = process.env['OIDC_REDIRECT_URI'] ?? ''
  if (!redirect.startsWith('https://')) {
    throw new Error('OIDC_REDIRECT_URI must use HTTPS in production')
  }
}
