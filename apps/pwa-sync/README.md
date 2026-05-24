# apps/pwa-sync

Server-connected PWA target for Task App CRM.

This target reuses the shared core UI from `packages/core/src/`, sets `ENTERPRISE_DEPLOYMENT_POLICY`, injects `RxDBAdapter`, and calls `init()`. It is not the offline-web single-file artifact; it expects a host/backend that exposes the Hono auth and sync endpoints.

## Runtime Intent

| Concern           | Implementation                                                       |
| ----------------- | -------------------------------------------------------------------- |
| UI/business logic | Shared core in `packages/core/src/`                                  |
| Adapter           | `packages/adapter-rxdb/src/index.ts`                                 |
| Auth              | BFF OIDC/PKCE refresh flow; dev token fallback via `VITE_AUTH_TOKEN` |
| Server URL        | `VITE_SERVER_URL` or same-origin fallback                            |
| Output            | `dist/sync/index.html` from `pnpm run build:sync`                    |

Use this target when the CRM should sync through the server API. Use `apps/offline-web` for the local, no-server artifact.
