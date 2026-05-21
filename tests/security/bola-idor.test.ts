import { describe, it } from 'vitest'

describe('BOLA / IDOR controls', () => {
  describe('Horizontal privilege escalation', () => {
    it.todo('user A cannot read user B record by guessing ID')
    it.todo('user A cannot update user B record by crafting a PATCH request')
    it.todo('user A cannot delete user B record')
    it.todo('soft-deleted records are not accessible by other users in same org')
  })

  describe('Vertical privilege escalation', () => {
    it.todo('viewer-role user cannot create records')
    it.todo('viewer-role user cannot delete records')
    it.todo('editor-role user cannot access admin-only endpoints')
    it.todo('admin of org A cannot access any data in org B')
  })

  describe('Cross-tenant isolation (RLS)', () => {
    it.todo('direct DB query without RLS policy bypasses are impossible via API')
    it.todo('org_id is never accepted from client-supplied request body')
    it.todo('org_id is always derived from the authenticated JWT claims')
  })

  describe('Mass assignment', () => {
    it.todo('org_id field is stripped from all client-supplied payloads')
    it.todo('role field is stripped from client-supplied payloads')
    it.todo('createdAt / updatedAt cannot be spoofed by client')
  })
})
