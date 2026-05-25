---
name: offline-build
description: Build and validate the offline-web artifact for Task App CRM. Covers all three sub-profiles (browser-ai, no-ai, internal-ai), CSP hash validation, AI flag setup, and post-build testing checklist.
---

Build and validate the offline-web artifact for the profile specified in $ARGUMENTS (defaults to `browser-ai`).

## Three offline sub-profiles

| Profile                  | Build command                        | Output dir                  | AI allowed                                                                    |
| ------------------------ | ------------------------------------ | --------------------------- | ----------------------------------------------------------------------------- |
| **browser-ai** (default) | `pnpm run build:offline`             | `dist/offline/`             | Chrome Gemini Nano / Edge Phi-4-mini only (`allowedTiers: ['browser']`)       |
| **no-ai**                | `pnpm run build:offline:no-ai`       | `dist/offline-no-ai/`       | None — zero AI code in bundle                                                 |
| **internal-ai**          | `pnpm run build:offline:internal-ai` | `dist/offline-internal-ai/` | Browser AI + private Ollama endpoints (`allowedTiers: ['browser', 'ollama']`) |

Each build command automatically runs `generate-csp.mjs` after Vite to regenerate CSP hashes and write the SHA-256 integrity file.

## Build steps

1. Run the appropriate build command from the repo root (not `cd apps/offline-web`):

   ```bash
   pnpm run build:offline                # browser-ai profile
   pnpm run build:offline:no-ai          # no-ai profile
   pnpm run build:offline:internal-ai    # internal-ai profile
   ```

2. For the internal-ai profile with a specific Ollama endpoint:

   ```bash
   OT_AI_CONNECT_SRC="http://ai-server.internal:11434" pnpm run build:offline:internal-ai
   ```

   For browser-ai profile, `OT_AI_CONNECT_SRC` only affects the CSP `connect-src` directive — it does NOT enable Ollama.

3. Verify the output file was created:
   - `dist/offline/index.html` (browser-ai)
   - `dist/offline-no-ai/index.html` (no-ai)
   - `dist/offline-internal-ai/index.html` (internal-ai)
   - Corresponding `.sha256` file in the same directory

## Post-build checklist

Run through these after every build before reporting success:

**File integrity**

- [ ] Output `index.html` exists and is a single self-contained file (no external asset references for the offline profiles)
- [ ] SHA-256 file exists alongside `index.html`
- [ ] Run `pnpm run assert:offline-bundle` to verify bundle integrity constraints

**CSP validation**

- [ ] Open `index.html` in Chrome/Edge via `file://` protocol — no CSP violations in DevTools console
- [ ] Check that `<meta http-equiv="Content-Security-Policy">` in the built file has the hashes that match the inline scripts

**AI profile validation (browser-ai)**

- [ ] Chrome 127+: `chrome://flags/#prompt-api-for-gemini-nano` must be enabled; relaunch Chrome after enabling
- [ ] Edge 127+: equivalent flag at `edge://flags` must be enabled
- [ ] Navigate to the AI view in the app — built-in AI modal should appear (download disclaimer on first use only)
- [ ] Confirm no Ollama, cloud provider, or public network requests appear in DevTools Network tab
- [ ] Confirm no requests to `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`

**AI profile validation (no-ai)**

- [ ] Navigate to the AI view — confirm AI features are not accessible
- [ ] DevTools Network tab shows zero AI-related requests

**AI profile validation (internal-ai)**

- [ ] Browser AI works as in browser-ai profile
- [ ] Ollama endpoint at `OT_AI_CONNECT_SRC` is reachable and returns models
- [ ] Confirm no public cloud AI requests in DevTools Network tab

**General app validation**

- [ ] Auth flow works (create vault, unlock vault)
- [ ] CRM data is readable and writable (create a client, reload the page, confirm it persists)
- [ ] IndexedDB contains `nexus_vault_v2` and `nexus_data_v1` with encrypted blobs (verify via DevTools > Application > IndexedDB)
- [ ] No JavaScript errors in DevTools console during normal use

## Vite config files

Each profile has its own Vite configuration:

| Profile     | Config file                                   |
| ----------- | --------------------------------------------- |
| browser-ai  | `apps/offline-web/vite.config.ts`             |
| no-ai       | `apps/offline-web/vite.no-ai.config.ts`       |
| internal-ai | `apps/offline-web/vite.internal-ai.config.ts` |

The configs alias WebGPU/transformers.js, Ollama, and cloud providers to disabled stubs as appropriate per profile.
