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
  }
}
