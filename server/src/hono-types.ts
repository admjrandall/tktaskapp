// Shared Hono context variable types.
// Import this and use `new Hono<HonoEnv>()` in every router so that
// c.get('tenantId') etc. resolve to `string` rather than `never`.

export type HonoEnv = {
  Variables: {
    tenantId: string
    userId: string
    role: string
    externalId: string
    email: string
    lockdownLevel: string // set by lockdownMiddleware; 'off' | 'standard' | 'strong' | 'strict'
    /** SHA-256(raw Bearer token), base64url. Set by authMiddleware for step-up revocation. */
    tokenHash: string
  }
}
