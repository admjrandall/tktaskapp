// Concrete biometric adapter — capacitor-native-biometric (iOS / Android).
// Stores only the AES-KW wrapped master key in the platform Keychain / Keystore.
// The raw master password and derived CryptoKey never touch this adapter.
//
// Security invariants (MASVS-CRYPTO-1, NIST SP 800-63B-4 AAL2):
//   iOS:     Keychain item with kSecAttrAccessibleWhenUnlockedThisDeviceOnly
//            — never synced to iCloud, never accessible to other apps.
//   Android: Keystore-backed key with setUserAuthenticationRequired(true)
//            and setInvalidatedByBiometricEnrollment(true)
//            — biometric enrollment change permanently invalidates the stored key.

import { NativeBiometric, BiometryType } from 'capacitor-native-biometric'
import {
  BiometricUnlockAdapter,
  type BiometricAvailability,
  type BiometricPromptOptions,
  type BiometricType as AppBiometricType,
} from './biometric-unlock-adapter.js'

// Fixed server string used as the Keychain / Keystore credential label.
// Must be constant — changing this effectively deletes all stored keys.
const CREDENTIAL_SERVER = 'com.taskappcrm.vault.wrappedkey'
const CREDENTIAL_USERNAME = 'vault'

// See crypto.ts u8ToBase64 — chunked approach prevents RangeError on large keys.
function u8ToB64(data: Uint8Array): string {
  const anyU8 = data as unknown as { toBase64?: () => string }
  if (typeof anyU8.toBase64 === 'function') return anyU8.toBase64()
  const CHUNK = 65536
  let s = ''
  for (let i = 0; i < data.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, data.subarray(i, i + CHUNK) as unknown as number[])
  }
  return btoa(s)
}

function b64ToU8(b64: string): Uint8Array {
  const anyU8 = Uint8Array as unknown as { fromBase64?: (b: string) => Uint8Array }
  if (typeof anyU8.fromBase64 === 'function') return anyU8.fromBase64(b64)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function mapBiometryType(t: BiometryType): AppBiometricType {
  switch (t) {
    case BiometryType.TOUCH_ID:
      return 'touchId'
    case BiometryType.FACE_ID:
      return 'faceId'
    case BiometryType.FINGERPRINT:
    case BiometryType.MULTIPLE:
      return 'fingerprint'
    case BiometryType.IRIS_AUTHENTICATION:
      return 'iris'
    default:
      return 'none'
  }
}

export class CapacitorBiometricAdapter extends BiometricUnlockAdapter {
  override async isAvailable(): Promise<BiometricAvailability> {
    try {
      const result = await NativeBiometric.isAvailable({ useFallback: false })
      return {
        available: result.isAvailable,
        biometricType: mapBiometryType(result.biometryType),
        enrolled: result.isAvailable,
      }
    } catch {
      return { available: false, biometricType: 'none', enrolled: false }
    }
  }

  override async storeWrappedKey(wrappedKey: Uint8Array): Promise<void> {
    await NativeBiometric.setCredentials({
      server: CREDENTIAL_SERVER,
      username: CREDENTIAL_USERNAME,
      password: u8ToB64(wrappedKey),
    })
  }

  override async retrieveWrappedKey(prompt: BiometricPromptOptions): Promise<Uint8Array> {
    const verifyOpts: Parameters<typeof NativeBiometric.verifyIdentity>[0] = {
      reason: prompt.description ?? prompt.title,
      title: prompt.title,
      negativeButtonText: prompt.cancelButtonText ?? 'Cancel',
    }
    if (prompt.subtitle !== undefined) verifyOpts.subtitle = prompt.subtitle
    if (prompt.description !== undefined) verifyOpts.description = prompt.description
    await NativeBiometric.verifyIdentity(verifyOpts)
    const cred = await NativeBiometric.getCredentials({
      server: CREDENTIAL_SERVER,
    })
    return b64ToU8(cred.password)
  }

  override async deleteWrappedKey(): Promise<void> {
    try {
      await NativeBiometric.deleteCredentials({ server: CREDENTIAL_SERVER })
    } catch {
      // Not found is acceptable
    }
  }

  override async hasStoredKey(): Promise<boolean> {
    try {
      const cred = await NativeBiometric.getCredentials({ server: CREDENTIAL_SERVER })
      return !!cred.password
    } catch {
      return false
    }
  }
}
