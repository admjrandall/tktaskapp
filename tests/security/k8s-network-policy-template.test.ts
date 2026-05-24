import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Kubernetes NetworkPolicy production template', () => {
  it('uses required CIDR variables instead of unsafe defaults or documentation ranges', () => {
    const template = readFileSync(resolve(process.cwd(), 'infra/k8s/network-policy.yaml'), 'utf8')
    const renderer = readFileSync(
      resolve(process.cwd(), 'scripts/render-k8s-network-policy.mjs'),
      'utf8',
    )

    expect(template).toContain('${KMS_EGRESS_CIDR}')
    expect(template).toContain('${IDP_EGRESS_CIDR}')
    expect(template).not.toContain('cidr: 0.0.0.0/0')
    expect(template).not.toContain('cidr: 203.0.113.0/24')
    expect(renderer).toContain('KMS_EGRESS_CIDR')
    expect(renderer).toContain('IDP_EGRESS_CIDR')
    expect(renderer).toContain('must not allow all egress')
    expect(renderer).toContain('must not use documentation-only CIDR')
  })
})
