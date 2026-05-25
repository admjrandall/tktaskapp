import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')

describe('offline build profile scripts', () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }

  it('exposes all offline profile build scripts', () => {
    expect(pkg.scripts['build:offline']).toContain('apps/offline-web/vite.config.ts')
    expect(pkg.scripts['build:offline:no-ai']).toContain('apps/offline-web/vite.no-ai.config.ts')
    expect(pkg.scripts['build:offline:internal-ai']).toContain(
      'apps/offline-web/vite.internal-ai.config.ts',
    )
  })

  it('has dedicated Vite configs for no-AI and internal-AI profiles', () => {
    expect(existsSync(resolve(ROOT, 'apps/offline-web/vite.no-ai.config.ts'))).toBe(true)
    expect(existsSync(resolve(ROOT, 'apps/offline-web/vite.internal-ai.config.ts'))).toBe(true)
  })
})
