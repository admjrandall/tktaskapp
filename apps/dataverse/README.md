# apps/dataverse

Microsoft Dataverse / Power Platform Code App target for Task App CRM.

This target reuses the shared core UI from `packages/core/src/`, sets `DATAVERSE_DEPLOYMENT_POLICY`, injects `DataverseAdapter`, wires the Power Platform AI provider, and calls `init()`. It is not an offline-only deployment; data access goes through the Dataverse Web API using the token and environment URL provided by the Power Platform runtime.

## Runtime Intent

| Concern           | Implementation                                                       |
| ----------------- | -------------------------------------------------------------------- |
| UI/business logic | Shared core in `packages/core/src/`                                  |
| Adapter           | `packages/adapter-dataverse/src/index.ts`                            |
| Auth/token source | `window.__msalToken` or `VITE_DATAVERSE_TOKEN` for local development |
| Environment URL   | `window.__dataverseUrl` or `VITE_DATAVERSE_ENV_URL`                  |
| Deployment policy | `DATAVERSE_DEPLOYMENT_POLICY`                                        |
| Output            | Built by `pnpm run build:dataverse`                                  |

Use this target for Power Platform deployments. Use `apps/offline-web` for the local, no-server artifact.
