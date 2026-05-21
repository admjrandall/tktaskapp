// Mobile profile build gate tests.
// Verifies that the mobile build artifact meets profile-level security requirements:
//   - No cleartext traffic configuration
//   - Correct ATS / NSC declarations
//   - No forbidden code (cloud endpoints, debug logging, disabled providers) in bundle
//
// Most tests are marked .todo until the mobile Capacitor build pipeline exists.
// The Info.plist and network_security_config.xml static checks can be done now.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')

describe('iOS ATS configuration', () => {
  it('Info.plist has NSAllowsArbitraryLoads set to false', () => {
    const plist = readFileSync(resolve(ROOT, 'apps/mobile/ios/App/Info.plist'), 'utf8')
    // Verify the key/value pair appears and the value is <false/>
    expect(plist).toContain('<key>NSAllowsArbitraryLoads</key>')
    const afterKey = plist.split('<key>NSAllowsArbitraryLoads</key>')[1]
    expect(afterKey.trimStart().startsWith('<false/>')).toBe(true)
  })

  it('Info.plist does not contain NSAllowsArbitraryLoadsInWebContent', () => {
    const plist = readFileSync(resolve(ROOT, 'apps/mobile/ios/App/Info.plist'), 'utf8')
    expect(plist).not.toContain('NSAllowsArbitraryLoadsInWebContent')
  })

  it('Info.plist does not declare wildcard NSExceptionDomains', () => {
    const plist = readFileSync(resolve(ROOT, 'apps/mobile/ios/App/Info.plist'), 'utf8')
    expect(plist).not.toContain('NSExceptionDomains')
  })
})

describe('iOS privacy manifest', () => {
  it('PrivacyInfo.xcprivacy declares NSPrivacyTracking as false', () => {
    const manifest = readFileSync(
      resolve(ROOT, 'apps/mobile/ios/App/PrivacyInfo.xcprivacy'),
      'utf8',
    )
    expect(manifest).toContain('<key>NSPrivacyTracking</key>')
    const afterKey = manifest.split('<key>NSPrivacyTracking</key>')[1]
    expect(afterKey.trimStart().startsWith('<false/>')).toBe(true)
  })

  it('PrivacyInfo.xcprivacy has an empty NSPrivacyTrackingDomains array', () => {
    const manifest = readFileSync(
      resolve(ROOT, 'apps/mobile/ios/App/PrivacyInfo.xcprivacy'),
      'utf8',
    )
    expect(manifest).toContain('NSPrivacyTrackingDomains')
    // Between the array tags there should be no <string> elements
    const match = manifest.match(
      /<key>NSPrivacyTrackingDomains<\/key>\s*<array>([\s\S]*?)<\/array>/,
    )
    expect(match).not.toBeNull()
    expect(match![1].includes('<string>')).toBe(false)
  })
})

describe('Android network security config', () => {
  it('network_security_config.xml has cleartextTrafficPermitted="false"', () => {
    const nsc = readFileSync(
      resolve(ROOT, 'apps/mobile/android/app/src/main/res/xml/network_security_config.xml'),
      'utf8',
    )
    expect(nsc).toContain('cleartextTrafficPermitted="false"')
  })

  it('network_security_config.xml does not trust user-installed CAs in base-config', () => {
    const nsc = readFileSync(
      resolve(ROOT, 'apps/mobile/android/app/src/main/res/xml/network_security_config.xml'),
      'utf8',
    )
    // The base-config block must not contain src="user"
    const baseConfigMatch = nsc.match(/<base-config[\s\S]*?<\/base-config>/)
    expect(baseConfigMatch).not.toBeNull()
    expect(baseConfigMatch![0]).not.toContain('src="user"')
  })
})

describe('Offline bundle — mobile JS bundle content gates', () => {
  const bundlePath = resolve(ROOT, 'dist/offline/index.html')

  it('offline bundle exists (run pnpm run build:offline if this fails)', () => {
    expect(existsSync(bundlePath), 'dist/offline/index.html must exist').toBe(true)
  })

  it('offline bundle contains no cloud AI API endpoint strings (MASVS-NETWORK-1)', () => {
    // The offline/browser-ai build profile disables all cloud providers via Vite aliases
    // (apps/offline-web/vite.config.ts). These domains must not appear in the bundle.
    if (!existsSync(bundlePath)) return
    const bundle = readFileSync(bundlePath, 'utf8')
    const forbidden = ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com']
    for (const domain of forbidden) {
      expect(bundle, `bundle must not contain "${domain}"`).not.toContain(domain)
    }
  })

  it('offline bundle contains no console.log calls (production build gate)', () => {
    // Vite removes console.log in production builds.
    // If this fails: check that vite.config.ts has esbuild.drop: ['console'] or
    // that minification is active.
    if (!existsSync(bundlePath)) return
    const bundle = readFileSync(bundlePath, 'utf8')
    expect(bundle, 'production bundle must not contain console.log').not.toContain('console.log')
  })
})

describe('Mobile build artifact gates', () => {
  it.todo('mobile release IPA contains no cloud AI endpoint strings')

  it.todo('mobile release APK contains no cloud AI endpoint strings')

  it.todo('mobile release IPA contains no console.log calls in production JavaScript')

  it.todo(
    'mobile release build bundle does not include @capacitor/camera permissions unless declared in Info.plist',
  )

  it.todo(
    'model SHA-256 hashes in build config match the model files at build time (supply chain gate)',
  )
})
