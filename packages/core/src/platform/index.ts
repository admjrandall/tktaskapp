// ── Platform abstraction layer ─────────────────────────────────────────────────
// Provides a uniform interface to query which capabilities are available in
// the current deployment target so feature branches don't litter the code with
// `typeof window !== 'undefined'` or `Capacitor.isNativePlatform()` checks.
//
// Usage:
//   const platform = detectPlatform()
//   if (platform.capabilities.nativeFileSystem) { ... }
//
// Concrete platform objects are detected once at module load time and cached.
// They are pure capability queries — no side effects, no async, no globals mutated.

// ── Platform identifiers ───────────────────────────────────────────────────────

export type PlatformName =
  | 'browser-offline' // file:// origin, NullAdapter
  | 'browser-enterprise' // HTTPS PWA, RxDBAdapter
  | 'capacitor-ios' // Capacitor WebView on iOS
  | 'capacitor-android' // Capacitor WebView on Android
  | 'dataverse' // Microsoft Power Platform Code App

// ── Capability flags ───────────────────────────────────────────────────────────

export interface PlatformCapabilities {
  /** File System Access API available (Chrome/Edge desktop; NOT available in Capacitor WebView). */
  readonly webFileSystemAccess: boolean
  /** Capacitor native filesystem available (iOS Library/Application Support, Android filesDir). */
  readonly nativeFileSystem: boolean
  /** Capacitor biometric authentication (Face ID / Touch ID / Fingerprint). */
  readonly biometricAuth: boolean
  /** W3C Push API + service worker available (HTTPS PWA only). */
  readonly pushNotifications: boolean
  /** Service worker support (HTTPS only; not file://). */
  readonly serviceWorker: boolean
  /** Background Sync API (Chrome/Edge HTTPS; not available in Capacitor WebView). */
  readonly backgroundSync: boolean
  /** Dataverse environment — Power Platform AI and connectors available. */
  readonly powerPlatformAi: boolean
  /** IndexedDB available (all platforms). */
  readonly indexedDB: boolean
  /** Clipboard API available. */
  readonly clipboard: boolean
  /** Web Share API available (mobile browsers and Capacitor). */
  readonly webShare: boolean
}

// ── Platform descriptor ────────────────────────────────────────────────────────

export interface IPlatform {
  readonly name: PlatformName
  readonly capabilities: PlatformCapabilities
  /** User-agent OS family, if detectable. */
  readonly os: 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown'
  /** True when the UI should be optimised for touch (≥ 1 touch point). */
  readonly isTouch: boolean
  /** True when a network connection is available at detection time. */
  readonly isOnline: boolean
}

// ── OS detection ───────────────────────────────────────────────────────────────

function detectOs(): IPlatform['os'] {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  if (/win/.test(ua)) return 'windows'
  if (/mac/.test(ua)) return 'macos'
  if (/linux/.test(ua)) return 'linux'
  return 'unknown'
}

// ── Platform detection ─────────────────────────────────────────────────────────

export function detectPlatform(): IPlatform {
  const isNode = typeof window === 'undefined'
  if (isNode) {
    return {
      name: 'browser-offline',
      os: 'unknown',
      isTouch: false,
      isOnline: false,
      capabilities: {
        webFileSystemAccess: false,
        nativeFileSystem: false,
        biometricAuth: false,
        pushNotifications: false,
        serviceWorker: false,
        backgroundSync: false,
        powerPlatformAi: false,
        indexedDB: false,
        clipboard: false,
        webShare: false,
      },
    }
  }

  // Detect Capacitor native platform without importing @capacitor/core so this
  // module stays tree-shakeable in non-Capacitor builds.
  const win = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
    __msalToken?: string
  }
  const capacitor = win.Capacitor
  const isNative = capacitor?.isNativePlatform?.() ?? false
  const capacitorPlatform = capacitor?.getPlatform?.() ?? ''

  const isDataverse = typeof win.__msalToken !== 'undefined'
  const os = detectOs()

  let name: PlatformName
  if (isDataverse) {
    name = 'dataverse'
  } else if (isNative && (os === 'ios' || capacitorPlatform === 'ios')) {
    name = 'capacitor-ios'
  } else if (isNative && (os === 'android' || capacitorPlatform === 'android')) {
    name = 'capacitor-android'
  } else if (window.location.protocol === 'file:') {
    name = 'browser-offline'
  } else {
    name = 'browser-enterprise'
  }

  const capabilities: PlatformCapabilities = {
    webFileSystemAccess: 'showOpenFilePicker' in window && !isNative,
    nativeFileSystem: isNative,
    biometricAuth: isNative,
    pushNotifications: 'PushManager' in window && 'serviceWorker' in navigator,
    serviceWorker: 'serviceWorker' in navigator && window.location.protocol === 'https:',
    backgroundSync: 'serviceWorker' in navigator && 'SyncManager' in window,
    powerPlatformAi: isDataverse,
    indexedDB: 'indexedDB' in window,
    clipboard: 'clipboard' in navigator,
    webShare: 'share' in navigator,
  }

  return {
    name,
    os,
    isTouch: navigator.maxTouchPoints > 0,
    isOnline: navigator.onLine,
    capabilities,
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────
// Detected once; never changes within a page load. Exported for direct import.

let _platform: IPlatform | null = null

export function getPlatform(): IPlatform {
  if (!_platform) _platform = detectPlatform()
  return _platform
}

/** Reset the cached singleton — test use only. */
export function _resetPlatformCache(): void {
  _platform = null
}

// ── Capability guards ──────────────────────────────────────────────────────────
// Convenience predicates so callers avoid spreading `getPlatform().capabilities.*`.

export function hasNativeFileSystem(): boolean {
  return getPlatform().capabilities.nativeFileSystem
}

export function hasBiometricAuth(): boolean {
  return getPlatform().capabilities.biometricAuth
}

export function hasServiceWorker(): boolean {
  return getPlatform().capabilities.serviceWorker
}

export function isCapacitorNative(): boolean {
  const { name } = getPlatform()
  return name === 'capacitor-ios' || name === 'capacitor-android'
}

export function isOfflineBuild(): boolean {
  return getPlatform().name === 'browser-offline'
}

export function isDataverseBuild(): boolean {
  return getPlatform().name === 'dataverse'
}
