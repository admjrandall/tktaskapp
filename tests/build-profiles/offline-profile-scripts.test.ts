import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')

describe('offline build profile scripts', () => {
  const rootPkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const offlinePkg = JSON.parse(
    readFileSync(resolve(ROOT, 'apps/offline-web/package.json'), 'utf8'),
  ) as { scripts: Record<string, string> }

  it('root scripts delegate to Turborepo for all offline profiles', () => {
    expect(rootPkg.scripts['build:offline']).toContain('turbo run build:offline')
    expect(rootPkg.scripts['build:offline:no-ai']).toContain('turbo run build:offline:no-ai')
    expect(rootPkg.scripts['build:offline:internal-ai']).toContain(
      'turbo run build:offline:internal-ai',
    )
    // All three target the offline-web package
    expect(rootPkg.scripts['build:offline']).toContain('@tktaskapp/offline-web')
    expect(rootPkg.scripts['build:offline:no-ai']).toContain('@tktaskapp/offline-web')
    expect(rootPkg.scripts['build:offline:internal-ai']).toContain('@tktaskapp/offline-web')
  })

  it('offline-web package scripts reference the correct Vite configs', () => {
    expect(offlinePkg.scripts['build:offline']).toContain('vite.config.ts')
    expect(offlinePkg.scripts['build:offline:no-ai']).toContain('vite.no-ai.config.ts')
    expect(offlinePkg.scripts['build:offline:internal-ai']).toContain('vite.internal-ai.config.ts')
  })

  it('offline-web package scripts regenerate CSP hashes after every build', () => {
    expect(offlinePkg.scripts['build:offline']).toContain('generate-csp.mjs')
    expect(offlinePkg.scripts['build:offline:no-ai']).toContain('generate-csp.mjs')
    expect(offlinePkg.scripts['build:offline:internal-ai']).toContain('generate-csp.mjs')
  })

  it('has dedicated Vite configs for no-AI and internal-AI profiles', () => {
    expect(existsSync(resolve(ROOT, 'apps/offline-web/vite.no-ai.config.ts'))).toBe(true)
    expect(existsSync(resolve(ROOT, 'apps/offline-web/vite.internal-ai.config.ts'))).toBe(true)
  })
})
