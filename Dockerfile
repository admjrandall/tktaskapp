# syntax=docker/dockerfile:1.7
# Multi-stage build: node:22-alpine builder → distroless runtime

# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifest files first so dependency install is cached on its own layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc ./
COPY packages/*/package.json packages/
COPY apps/*/package.json apps/
COPY server/package.json server/

# Enable corepack and activate the exact pnpm version pinned in package.json
RUN corepack enable && \
    corepack prepare pnpm@11.1.2 --activate

# Install all workspace dependencies (frozen — no lockfile mutation in CI)
RUN pnpm install --frozen-lockfile

# Copy full source and build the server package only
COPY . .
RUN pnpm turbo run build:server

# ── Stage 2: runtime (distroless — no shell, no package manager, minimal attack surface) ──
FROM gcr.io/distroless/nodejs22-debian12 AS runtime

WORKDIR /app

# Copy only the compiled server output and its production node_modules
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules

# nonroot is the pre-created UID 65532 in all distroless images
USER nonroot

EXPOSE 3000

# Distroless has no shell — CMD must be JSON array form
CMD ["dist/server.js"]
