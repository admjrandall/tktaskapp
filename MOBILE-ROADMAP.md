# Mobile Roadmap — iOS & Android
**Created:** 2026-05-17
**Scope:** Offline-first CRM with on-device AI — no server, no CORS, no admin rights required

---

## Key Constraints Driving This Plan

- Chrome Prompt API (Gemini Nano) is **desktop only** — not available on Android or iOS
- iOS forces WebKit on all browsers — no Chrome engine, no Chrome Prompt API, no reliable WebGPU
- WebGPU via transformers.js is too fragmented on mobile for production use
- `file://` + CORS is a dead end on mobile just as on desktop
- **Answer: Capacitor native wrapper + `@capgo/capacitor-llm` plugin**
  — native bridge bypasses CORS entirely, fully offline, no server, no admin rights

---

## Architecture

```
packages/core/src/  (unchanged — same web app)
        ↓
Capacitor bridge  (no HTTP, no CORS)
        ↓
Native on-device AI
  iOS     → Apple Intelligence (iOS 18.1+, A17 Pro / M-series)
            or ExecuTorch .pte models (older devices)
  Android → Gemini Nano via MediaPipe (Pixel 8+, Galaxy S24, Snapdragon 8 Gen 3)
            or MediaPipe custom models (Android API 24+, broader device support)
```

---

## Minimum Device Requirements

| Platform | Tier | Minimum Hardware | AI Engine |
|----------|------|-----------------|-----------|
| iOS | Best | iPhone 15 Pro+, iPad M1+ | Apple Intelligence (no model download) |
| iOS | Fallback | iPhone 12+, iPad A12+ | ExecuTorch bundled/downloaded model |
| Android | Best | Pixel 8+, Galaxy S24, Snapdragon 8 Gen 3 | Gemini Nano via AICore |
| Android | Fallback | Android API 24+ (Android 7.0+) | MediaPipe custom model |

---

## What Needs to Be Built

### 1. Complete Capacitor Setup (1–2 days)
- `apps/mobile/` is already scaffolded — wire up Capacitor 8
- Add iOS platform (`npx cap add ios`) — requires Mac + Xcode
- Add Android platform (`npx cap add android`) — requires Android Studio
- Configure `capacitor.config.ts` with correct webDir pointing to built output
- Add `@capgo/capacitor-llm` plugin

### 2. MobileAIProvider (2–3 days)
- Create `packages/core/src/ai/providers/mobile-native.ts`
- Calls `@capgo/capacitor-llm` bridge instead of HTTP requests to Ollama
- Same interface as other providers — `load()`, `call()`, `stream()`
- Handles both iOS (Apple Intelligence / ExecuTorch) and Android (Gemini Nano / MediaPipe) through one abstraction

### 3. Mobile Deployment Policy (0.5 days)
- Add `MOBILE_DEPLOYMENT_POLICY` to `deployment-policy.ts`
- Disables: cloud AI, Ollama HTTP tier, browser transformers download
- Enables: native on-device tier only
- No `connect-src` relaxation needed — native bridge, not HTTP

### 4. Mobile Entry Point (0.5 days)
- Create `apps/mobile/src/entry.ts`
- Sets mobile deployment policy
- Sets NullAdapter (same as offline — no sync yet)
- Registers MobileAIProvider as the active AI backend
- Calls `init()`

### 5. Model Distribution Strategy (1 day)
- **iOS Apple Intelligence:** zero effort — model is part of iOS, no download needed
- **iOS ExecuTorch fallback:** document model download flow post-install; model files are large (1–4 GB)
- **Android Gemini Nano:** available automatically on supported devices via AICore
- **Android MediaPipe fallback:** bundle small model or download post-install
- For airgapped OT: pre-load models via MDM before device goes into field

### 6. Distribution Packaging (0.5 days)
- **iOS:** Apple Developer Enterprise Program ($299/yr) for MDM distribution without App Store
  - Output: signed `.ipa` pushed via Jamf / Intune / direct download link
  - No App Store review, no App Store needed
- **Android:** APK sideload or MDM push via Samsung Knox / Android Enterprise
  - Output: signed `.apk` — no Google Play needed
  - Enable "Install unknown apps" on device once, then MDM handles the rest

### 7. AI Settings UI — Mobile Tier (1 day)
- Update AI settings wizard to detect mobile context (`Capacitor.isNativePlatform()`)
- Show only the native tier option on mobile
- Display device compatibility check (Apple Intelligence available? Gemini Nano available?)
- Clear messaging when device doesn't meet hardware requirements

---

## What Does NOT Need to Change

- All of `packages/core/src/` — web app, crypto, CRM logic, views, state
- `NullAdapter` — same offline-only sync as desktop
- Encryption (AES-256-GCM, PBKDF2) — WebCrypto works in Capacitor WebView
- IndexedDB — works in Capacitor WebView
- File System Access API — **not available** in Capacitor WebView; disk backup feature will be absent on mobile (IDB only)

---

## Open Questions Before Starting

1. **Mac available for iOS build?** Xcode is required — iOS builds cannot be done on Windows
2. **Apple Developer account?** Enterprise Program ($299/yr) for MDM distribution, or standard ($99/yr) for App Store
3. **Target Android SDK minimum?** API 24 (Android 7) covers ~98% of active devices; API 28+ for Gemini Nano
4. **Airgapped model delivery?** If devices never connect to internet, models must be bundled in the app or pushed via MDM separately
5. **Priority: iOS first, Android first, or both together?**

---

## Estimated Total Effort

| Phase | Effort |
|-------|--------|
| Capacitor setup + plugin | 1–2 days |
| MobileAIProvider | 2–3 days |
| Policy + entry point | 1 day |
| Model distribution plan | 1 day |
| Distribution packaging | 0.5 days |
| AI settings UI updates | 1 day |
| **Total** | **~1 week** |

Mac required for iOS. Android can be built on Windows.
