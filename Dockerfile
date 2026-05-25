# syntax=docker/dockerfile:1.7
# Three-stage build: dependency cache → builder → distroless runtime.
#
# Stage 1 (deps): installs all workspace dependencies with a layer that only
#   invalidates when package manifests or the lockfile change — not on source edits.
#
# Stage 2 (builder): compiles the server to a single ESM bundle (local source
#   only; npm packages are kept external via --packages=external so they are
#   resolved from node_modules at runtime). Then `pnpm deploy` creates a
#   self-contained /app/server-deploy directory with a flat node_modules that
#   has no symlinks into the pnpm virtual store — safe to copy into a minimal
#   runtime image.
#
# Stage 3 (runtime): distroless/nodejs22 — no shell, no package manager,
#   UID 65532 (nonroot). Only the compiled bundle, its dependencies, and the
#   package.json (so Node.js recognises dist/server.js as ESM) are present.

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy only package manifests first so this layer is cached on lockfile/manifest
# changes and not on source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc ./

# Copy every package.json that exists under packages/ and apps/ while preserving
# directory structure (BuildKit resolves globs relative to the build context).
# Packages that have no package.json are skipped automatically.
COPY packages/ packages/
COPY apps/offline-web/package.json apps/offline-web/
COPY server/package.json server/

RUN corepack enable && \
    corepack prepare pnpm@11.1.2 --activate

# frozen-lockfile: fail the build if the lockfile is out of date
RUN pnpm install --frozen-lockfile

# ── Stage 2: compile and deploy ───────────────────────────────────────────────
FROM deps AS builder

# Copy server source on top of the cached dependency layer
COPY server/ server/

# tsc type-check then esbuild:
#   --bundle          bundle all local source into one file
#   --packages=external  keep npm packages as external imports (resolved at runtime)
#   --format=esm      required: jose v6 is ESM-only; package has "type":"module"
#   --platform=node   node built-ins (node:crypto etc.) remain external
#   --target=node22   emit syntax supported by the runtime image
RUN pnpm --filter @tktaskapp/server run build

# pnpm deploy resolves pnpm's virtual-store symlinks (server/node_modules/* →
# ../../node_modules/.pnpm/…) into real files so the runtime image does not need
# the workspace root node_modules.  --prod omits devDependencies.
# The "files":["dist"] field in server/package.json ensures dist/ is included
# despite being listed in .gitignore.
RUN pnpm --filter @tktaskapp/server deploy --prod /app/server-deploy

# ── Stage 3: runtime (distroless — no shell, no package manager) ─────────────
FROM gcr.io/distroless/nodejs22-debian12 AS runtime

WORKDIR /app

# package.json must be present so Node.js sees "type":"module" and treats
# dist/server.js as ESM (Node.js searches up from the file for package.json).
COPY --from=builder /app/server-deploy/package.json     ./package.json
COPY --from=builder /app/server-deploy/dist             ./dist
COPY --from=builder /app/server-deploy/node_modules     ./node_modules

# nonroot is the pre-created UID 65532 in all distroless images
USER nonroot

EXPOSE 3000

# Distroless has no shell — CMD must be JSON array form
CMD ["dist/server.js"]
