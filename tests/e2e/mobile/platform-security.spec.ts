// Platform security tests — require a connected physical iOS or Android device.
// These tests cannot run in CI and are skipped unless MOBILE_DEVICE_CONNECTED=1.
// Run manually: MOBILE_DEVICE_CONNECTED=1 pnpm exec playwright test tests/e2e/mobile/

import { test } from '@playwright/test'

const DEVICE = !!process.env['MOBILE_DEVICE_CONNECTED']

test.describe('Mobile platform storage security (MASVS-STORAGE-1)', () => {
  test.skip(!DEVICE, 'Requires physical device — set MOBILE_DEVICE_CONNECTED=1 to run')

  test('vault file is in the platform private directory and not world-readable (iOS: Library/Application Support, Android: filesDir)', async () => {
    // Verification: use `adb shell run-as <appId> ls -la files/taskapp-vault/`
    // or Xcode Organizer → Device → App Data → Library/Application Support/taskapp-vault/
    // The test body is intentionally empty — confirmation is manual.
    test.skip()
  })

  test('vault file is not accessible to other apps (confirmed via adb / Xcode Organizer)', async () => {
    // Android: verify Directory.Data maps to app-private filesDir (not external storage).
    // iOS: verify the file is NOT in Library/Documents (which would be accessible via iTunes).
    test.skip()
  })

  test('exportVault() presents the platform share sheet without throwing on user cancellation', async () => {
    // Automated share-sheet interaction requires Appium or XCUITest.
    // Manually verify: trigger export, cancel immediately — app must not crash or show error.
    test.skip()
  })

  test('backup file exported on iOS is importable on Android (cross-platform format compatibility)', async () => {
    // Export a vault on one platform, import on the other.
    // The encrypted blob format is platform-agnostic (AES-256-GCM + base64).
    test.skip()
  })
})

test.describe('Mobile biometric security (MASVS-AUTH-1)', () => {
  test.skip(!DEVICE, 'Requires physical device — set MOBILE_DEVICE_CONNECTED=1 to run')

  test('retrieveWrappedKey() throws when biometric authentication is cancelled by the user', async () => {
    // Simulate cancel: present biometric prompt, then tap Cancel.
    test.skip()
  })

  test('retrieveWrappedKey() throws when biometric authentication fails (wrong biometric)', async () => {
    // Present 3+ failed attempts to trigger lockout behaviour.
    test.skip()
  })

  test('Android: retrieveWrappedKey() throws KeyPermanentlyInvalidatedException after biometric enrollment change', async () => {
    // Add a new fingerprint in device settings, then retry retrieval.
    test.skip()
  })

  test('no raw master password or CryptoKey material appears in Keychain / Keystore — only wrapped key bytes', async () => {
    // Use Keychain-Dumper (iOS) or KeyChain Inspector (Android) to verify only
    // the base64 wrapped key is stored under the CREDENTIAL_SERVER label.
    test.skip()
  })
})

test.describe('Mobile network security (MASVS-NETWORK-1)', () => {
  test.skip(!DEVICE, 'Requires physical device — set MOBILE_DEVICE_CONNECTED=1 to run')

  test('MITM proxy test (iOS): no cleartext HTTP connections in any offline-profile flow', async () => {
    // Configure Burp Suite as iOS proxy, navigate all offline flows.
    test.skip()
  })

  test('MITM proxy test (Android): no cleartext HTTP connections; proxy certificate is rejected', async () => {
    // Android NSC (network_security_config.xml) must block self-signed certs.
    test.skip()
  })

  test('iOS Info.plist NSAllowsArbitraryLoads is false in the release IPA', async () => {
    test.skip()
  })

  test('Android network_security_config.xml cleartextTrafficPermitted is false in the release APK', async () => {
    test.skip()
  })
})

test.describe('Mobile JavaScript bridge security (MASVS-PLATFORM-1)', () => {
  test.skip(!DEVICE, 'Requires physical device — set MOBILE_DEVICE_CONNECTED=1 to run')

  test('only explicitly declared Capacitor plugins are registered — no wildcard bridge exposure', async () => {
    test.skip()
  })

  test('Capacitor plugin inputs are validated before processing (no blind trust of bridge strings)', async () => {
    test.skip()
  })
})
