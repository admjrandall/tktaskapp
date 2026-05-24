# apps/enterprise-web

Server-backed enterprise web target for Task App CRM.

This target reuses the shared core UI from `packages/core/src/`, checks server liveness, uses the BFF OIDC/PKCE refresh flow, sets `ENTERPRISE_DEPLOYMENT_POLICY`, injects `RxDBAdapter`, and calls `init()`. It is a connected deployment path and is distinct from the offline-web single-file artifact.

## Runtime Intent

| Concern           | Implementation                                                             |
| ----------------- | -------------------------------------------------------------------------- |
| UI/business logic | Shared core in `packages/core/src/`                                        |
| Adapter           | `packages/adapter-rxdb/src/index.ts`                                       |
| Auth              | Server-managed OIDC/PKCE with refresh token in an HttpOnly SameSite cookie |
| Server URL        | `VITE_SERVER_URL` or same-origin fallback                                  |
| Health gate       | `GET /healthz` before bootstrap                                            |
| Deployment policy | `ENTERPRISE_DEPLOYMENT_POLICY`                                             |

There is currently no root `build:enterprise` script or `apps/enterprise-web/vite.config.ts`; the entry documents and implements the connected bootstrap path, but packaging still needs to be wired before this target can be built like the others.
