// Biometric unlock adapter — abstract.
// Stores only a wrapped (AES-KW encrypted) master key in the platform secure
// enclave / Keystore — never the raw master password or derived CryptoKey.
//
//   iOS:     LocalAuthentication + Keychain item
//              - kSecAccessControlBiometryAny (any enrolled biometric)
//              - kSecAttrAccessibleWhenUnlockedThisDeviceOnly
//              - kSecAttrSynchronizable: false (never synced to iCloud)
//   Android: BiometricPrompt + Android Keystore
//              - setUserAuthenticationRequired(true)
//              - setInvalidatedByBiometricEnrollment(true)  ← enrollment change = key wiped
//              - StrongBox-backed if available (FIPS 140-2 Level 3)
//
// Security invariants:
//   1. The raw master password must never be passed to this adapter.
//   2. Biometric enrollment changes on Android permanently invalidate the stored key,
//      requiring re-entry of the master password to re-enroll (by design).
//   3. On iOS, Face ID/Touch ID prompt is system-controlled — the app cannot skip it.

export type BiometricType = 'touchId' | 'faceId' | 'fingerprint' | 'iris' | 'none'

export interface BiometricAvailability {
  available: boolean
  biometricType: BiometricType
  /** True if at least one biometric credential is enrolled on this device. */
  enrolled: boolean
  /** Human-readable reason when !available (for display, not for logging). */
  reason?: string
}

export interface BiometricPromptOptions {
  title: string
  subtitle?: string
  description?: string
  cancelButtonText?: string
}

export abstract class BiometricUnlockAdapter {
  /**
   * Check if biometric authentication is available and enrolled.
   * Does not trigger any system permission prompts.
   * On Android, returns false if the device has no biometric hardware or the
   * BiometricManager reports BIOMETRIC_ERROR_NONE_ENROLLED.
   */
  abstract isAvailable(): Promise<BiometricAvailability>

  /**
   * Store a wrapped master key in the platform secure enclave / Keystore.
   * The wrapping key is bound to biometric authentication — subsequent retrieval
   * requires a successful biometric or device credential verification.
   * Overwrites any previously stored key.
   * The caller is responsible for producing the wrapped key material via
   * SubtleCrypto.wrapKey() before calling this method.
   */
  abstract storeWrappedKey(wrappedKey: Uint8Array): Promise<void>

  /**
   * Present the platform biometric prompt and, on success, return the stored wrapped key.
   * The caller then unwraps the key using SubtleCrypto.unwrapKey().
   * Throws if:
   *   - authentication fails or is cancelled
   *   - no key is stored (hasStoredKey() === false)
   *   - on Android: biometric enrollment has changed since the key was stored
   *     (KeyPermanentlyInvalidatedException — caller must prompt for master password)
   */
  abstract retrieveWrappedKey(prompt: BiometricPromptOptions): Promise<Uint8Array>

  /**
   * Permanently delete the stored wrapped key.
   * Call on: user-initiated logout, master password change, vault wipe.
   * Does not throw if no key is currently stored.
   */
  abstract deleteWrappedKey(): Promise<void>

  /**
   * Returns true if a wrapped key is stored and available for retrieval.
   * Does not authenticate or trigger any system prompts.
   */
  abstract hasStoredKey(): Promise<boolean>
}
