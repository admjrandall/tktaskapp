// Mobile network policy — types and runtime enforcement helpers.
//
// Platform-level network lockdown is declared in native config files:
//   iOS:     ios/App/Info.plist        (NSAllowsArbitraryLoads: false)
//   Android: android/.../network_security_config.xml (cleartextTrafficPermitted: false)
//
// This module provides the runtime WebView navigation allowlist and startup
// assertion so app code can verify policy is correctly configured before init().

export interface MobileNetworkPolicy {
  /** Must be false — cleartext HTTP is prohibited in all mobile production builds. */
  readonly cleartextTrafficPermitted: boolean
  /** Approved HTTPS origins for WebView navigation. Empty = no external navigation. */
  readonly allowedNavigationOrigins: readonly string[]
  /** Block all external network requests originating from the WebView. */
  readonly blockExternalRequests: boolean
  /** Approved API origins for enterprise builds. Always empty for offline profile. */
  readonly approvedApiOrigins: readonly string[]
}

/** Network policy for the offline mobile profile — zero external network. */
export const OFFLINE_MOBILE_NETWORK_POLICY: MobileNetworkPolicy = {
  cleartextTrafficPermitted: false,
  allowedNavigationOrigins: [],
  blockExternalRequests: true,
  approvedApiOrigins: [],
} as const

/**
 * Evaluate whether a WebView navigation request is permitted by the current policy.
 * Call this inside the Capacitor shouldOverrideUrlLoading callback.
 * Returns true to allow navigation; false to cancel.
 *
 * Rules:
 *   1. HTTP (cleartext) is always denied regardless of policy.
 *   2. If blockExternalRequests is true, all origins are denied.
 *   3. Otherwise, origin must appear in allowedNavigationOrigins.
 */
export function isNavigationAllowed(url: string, policy: MobileNetworkPolicy): boolean {
  if (policy.blockExternalRequests) return false
  try {
    const { origin, protocol } = new URL(url)
    if (protocol === 'http:') return false
    return policy.allowedNavigationOrigins.includes(origin)
  } catch {
    return false
  }
}

/**
 * Assert that the provided policy satisfies the minimum mobile security baseline.
 * Throws with an audit-safe message (no PII, no URLs) if a violation is found.
 * Call during app startup, before init(), and log the outcome to the audit trail.
 */
export function assertNetworkPolicyCompliant(policy: MobileNetworkPolicy): void {
  if (policy.cleartextTrafficPermitted) {
    throw new Error('Mobile network policy violation: cleartext traffic must be prohibited')
  }
}
