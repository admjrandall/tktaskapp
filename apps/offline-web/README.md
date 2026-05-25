# apps/offline-web

Thin entry point for all offline-web build profiles. Sets the deployment policy and `NullAdapter`, then calls `init()` from `packages/core`.

No business logic lives here — see [`packages/core/src/`](../../packages/core/src/).

This target is the local, no-CRM-server deployment of Task App CRM. It is one deployment target in a larger monorepo that also contains PWA sync, mobile PWA, Dataverse, and enterprise/server-backed entries sharing the same core UI. Do not use this README to describe the whole product as offline-only.

---

## Three sub-profiles

This app target produces three distinct build artifacts depending on which entry file and Vite config are used.

| Profile                    | Entry file                 | Build command                        | Output artifact                       |
| -------------------------- | -------------------------- | ------------------------------------ | ------------------------------------- |
| **No AI**                  | `src/entry-no-ai.ts`       | `pnpm run build:offline:no-ai`       | `dist/offline-no-ai/index.html`       |
| **Browser AI** _(default)_ | `src/entry-browser-ai.ts`  | `pnpm run build:offline`             | `dist/offline/index.html`             |
| **Internal AI**            | `src/entry-internal-ai.ts` | `pnpm run build:offline:internal-ai` | `dist/offline-internal-ai/index.html` |

---

### No-AI (`entry-no-ai.ts`)

- **All AI tiers disabled.** The bundle contains zero AI code.
- Intended for maximum-security deployments where AI functionality is not required or not permitted.
- The dedicated Vite config aliases every AI provider to disabled stubs, ensuring no AI library code reaches the bundle.
- **CSP:** `connect-src 'self'` only — no external endpoints.

### Browser AI (`entry-browser-ai.ts`) — current default

- **Browser built-in AI only:** Chrome Gemini Nano / Edge Phi-4-mini via `window.LanguageModel`.
- Cloud AI, Ollama, and WebGPU/transformers.js are disabled (aliased to stubs in Vite config).
- AI runs entirely on-device — no data leaves the browser after the initial model download.
- **CSP:** `connect-src 'self'` plus optional `OT_AI_CONNECT_SRC` entries injected at build time.

### Internal AI (`entry-internal-ai.ts`)

- **Browser AI + local/private Ollama endpoints.**
- Designed for internal/enterprise deployments with a private LAN AI server.
- Set `OT_AI_CONNECT_SRC` at build time to allow specific private origins:
  ```bash
  OT_AI_CONNECT_SRC="http://ai-server.internal:11434" pnpm run build:offline:internal-ai
  ```
- Public cloud AI endpoints remain disabled.
- **CSP:** `connect-src 'self'` plus the `OT_AI_CONNECT_SRC` origins.

---

## Build (current — browser AI profile)

```bash
# Default build — browser AI profile → dist/offline/index.html
pnpm run build:offline

# Open in Chrome or Edge (no server needed)
start dist/offline/index.html    # Windows
open dist/offline/index.html     # macOS
```

For connected deployments, use the sibling app targets instead: `apps/enterprise-web` (HTTPS PWA + Capacitor) or `apps/dataverse` (Power Platform).

---

## AI requirements

For browser built-in AI to work:

- **Chrome 127+:** enable `chrome://flags/#prompt-api-for-gemini-nano`, relaunch.
- **Edge 127+:** enable the equivalent flag at `edge://flags`, relaunch.

The app shows a one-time download disclaimer when the model still needs fetching, then a progress bar, then connects automatically.
