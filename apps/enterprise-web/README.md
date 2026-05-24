# apps/enterprise-web

Enterprise web target for TechKey CRM — an HTTPS-hosted PWA served alongside the Hono API server.

This target is the **standard connected deployment**: browser, mobile browser (installable PWA), and Capacitor mobile WebView all use this build. It absorbs the former `pwa-sync` and `mobile` web targets, which were architecturally identical.

---

## What this target provides

| Concern             | Implementation                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------- |
| UI / business logic | Shared core in `packages/core/src/`                                                      |
| Adapter             | `packages/adapter-rxdb/src/index.ts` (RxDB ↔ Hono sync API)                              |
| Auth                | BFF OIDC/PKCE — access token in memory, refresh token in HttpOnly cookie                 |
| Server URL          | `VITE_SERVER_URL` env var or same-origin fallback                                        |
| Health gate         | `GET /healthz` checked before bootstrap                                                  |
| Deployment policy   | `ENTERPRISE_DEPLOYMENT_POLICY` (standard lockdown, 6-year audit retention, all AI tiers) |
| PWA                 | `manifest.webmanifest`, service worker (`sw.js`), installable on all platforms           |
| Mobile enhancements | Touch gestures, keyboard avoidance, safe-area insets (active on touch devices)           |
| Output              | `dist/enterprise/` — hashed JS/CSS assets + `index.html` + `sw.js` + manifest            |

---

## Build

```bash
# From repo root
pnpm run build:enterprise

# Outputs to dist/enterprise/
# Open via https://your-server.domain — NOT via file://
```

The Vite build produces **normal hashed assets** (not single-file). CSP is enforced via HTTP response headers set by the server, not a meta tag.

---

## Running locally (development)

```bash
# Start the API server
cd server && pnpm dev

# In a separate terminal, start the Vite dev server
vite --config apps/enterprise-web/vite.config.ts

# Set VITE_SERVER_URL to point at the API
VITE_SERVER_URL=http://localhost:3000 vite --config apps/enterprise-web/vite.config.ts
```

For quick local testing without auth, set `VITE_AUTH_TOKEN` in `.env.local` (dev only).

---

## Production deployment

The Hono server serves `dist/enterprise/` as static assets when `ENTERPRISE_STATIC_DIR` is set:

```bash
# In server environment
ENTERPRISE_STATIC_DIR=/app/dist/enterprise node dist/server.js
```

Cache policy enforced by the server:

- `/assets/*` — `Cache-Control: public, max-age=31536000, immutable` (content-hashed)
- `/index.html` — `Cache-Control: no-cache, no-store, must-revalidate`
- `/sw.js` — `Cache-Control: no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`

TLS termination should be handled by the reverse proxy (Nginx, Caddy, Azure App Gateway, Cloudflare, etc.) — not by the Node server directly. HSTS should be set by the reverse proxy.

---

## PWA installability

This build meets the 2026 installability requirements on all major platforms:

- **Chrome / Edge desktop**: install from the address bar or `⋮ → Install TechKey CRM`
- **iOS Safari**: Share → Add to Home Screen
- **Android Chrome**: install banner or browser menu
- **Capacitor native**: `capacitor.config.ts` points `webDir` at `dist/enterprise`; run `npx cap sync` after `pnpm run build:enterprise`

---

## Capacitor mobile

`apps/mobile/capacitor.config.ts` uses `webDir: '../../dist/enterprise'`. To build for native:

```bash
pnpm run build:enterprise          # build web assets
cd apps/mobile
npx cap sync                       # copy to native project
npx cap run ios                    # or: npx cap run android
```

See `apps/mobile/README.md` for native platform prerequisites.

---

## Public assets

| File                          | Purpose                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `public/manifest.webmanifest` | PWA manifest; `id`, `display_override`, shortcuts            |
| `public/sw.js`                | Service worker; cache-first assets, network-first API        |
| `public/app.css`              | Safe-area insets, 44px touch targets, responsive layout      |
| `public/icons/icon-192.png`   | PWA icon (any) — **must be provided before deployment**      |
| `public/icons/icon-512.png`   | PWA icon (maskable) — **must be provided before deployment** |

> Icons are not committed to the repo. Place them in `apps/enterprise-web/public/icons/` before building.

---

## Security contacts

Vulnerabilities: developer@techkeycloud.com — see [SECURITY.md](../../SECURITY.md)
