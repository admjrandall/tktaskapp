import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { dirname, relative, resolve } from 'node:path'

const TEMPLATE_PATH = resolve('infra/k8s/network-policy.yaml')
const OUTPUT_PATH = resolve(
  process.env['K8S_NETWORK_POLICY_OUTPUT'] ?? 'dist/k8s/network-policy.yaml',
)

const REQUIRED_CIDRS = ['KMS_EGRESS_CIDR', 'IDP_EGRESS_CIDR']
const DOC_ONLY_CIDRS = ['192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24', '2001:db8::/32']

function validateCidr(name, value) {
  if (!value) throw new Error(`${name} is required`)
  if (value === '0.0.0.0/0' || value === '::/0') {
    throw new Error(`${name} must not allow all egress`)
  }
  if (DOC_ONLY_CIDRS.includes(value)) {
    throw new Error(`${name} must not use documentation-only CIDR ${value}`)
  }
  const [address, prefixRaw] = value.split('/')
  const version = isIP(address)
  const prefix = Number(prefixRaw)
  if (!version || !Number.isInteger(prefix)) {
    throw new Error(`${name} must be a valid CIDR, received ${value}`)
  }
  const maxPrefix = version === 4 ? 32 : 128
  if (prefix < 0 || prefix > maxPrefix) {
    throw new Error(`${name} has invalid prefix length ${prefix}`)
  }
}

const replacements = Object.fromEntries(
  REQUIRED_CIDRS.map((name) => {
    const value = process.env[name]?.trim() ?? ''
    validateCidr(name, value)
    return [name, value]
  }),
)

let rendered = await readFile(TEMPLATE_PATH, 'utf8')
for (const [name, value] of Object.entries(replacements)) {
  rendered = rendered.replaceAll(`\${${name}}`, value)
}

if (rendered.includes('${')) {
  throw new Error('Rendered NetworkPolicy still contains unresolved template variables')
}

await mkdir(dirname(OUTPUT_PATH), { recursive: true })
await writeFile(OUTPUT_PATH, rendered)
console.log('Rendered ' + relative(process.cwd(), OUTPUT_PATH))
