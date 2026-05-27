# Turborepo Self-Hosted Remote Cache — S3 Backend

This document describes how to configure and operate the self-hosted Turborepo remote cache for Task App CRM.

Vercel's hosted remote cache is not used in this project. All cache traffic stays within the organization's own infrastructure.

---

## Required environment variables

Three environment variables must be set for Turborepo to connect to the self-hosted cache server. Set them in CI secrets and in local `.env.local` (never commit real values).

| Variable      | Purpose                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TURBO_TOKEN` | API token used to authenticate against the self-hosted cache server. Generated when you start the cache server — keep it secret.                                      |
| `TURBO_TEAM`  | Team (scope) identifier that namespaces cached artifacts. Use a stable slug, e.g. `tktaskapp`. Must match the value configured on the cache server.                   |
| `TURBO_API`   | Base URL of the self-hosted cache server, e.g. `https://cache.internal.example.com`. Must be reachable from all CI runners and developer machines that use the cache. |

A fourth variable — `TURBO_REMOTE_CACHE_SIGNATURE_KEY` — must be set **on the cache server** (not on clients). It is the HMAC secret used to sign and verify cache artifacts. This codebase enables artifact signing (`"signature": true` in `turbo.json`); without this key on the server, signed artifact verification will fail.

---

## Cache server: ducktors/turborepo-remote-cache

Reference: <https://github.com/ducktors/turborepo-remote-cache>

The recommended implementation is the open-source `ducktors/turborepo-remote-cache` server, which supports an S3-compatible object storage backend.

### Docker (single node)

```bash
docker run -d \
  --name turbo-cache \
  -p 3000:3000 \
  -e STORAGE_PROVIDER=s3 \
  -e S3_BUCKET=your-turbo-cache-bucket \
  -e S3_REGION=us-east-1 \
  -e TURBO_TOKEN=<your-secret-token> \
  -e TURBO_REMOTE_CACHE_SIGNATURE_KEY=<your-hmac-secret> \
  ducktors/turborepo-remote-cache:latest
```

AWS credentials for the S3 bucket can be supplied via the standard SDK chain (env vars `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, or an attached IAM role if running on EC2/ECS/EKS).

Expose the server behind a TLS-terminating reverse proxy (nginx, Caddy, ALB) so that clients connect over HTTPS.

### Kubernetes

Create a `Deployment` and `Service`, then expose via an `Ingress` with a TLS certificate:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: turbo-cache
  namespace: build-infra
spec:
  replicas: 2
  selector:
    matchLabels:
      app: turbo-cache
  template:
    metadata:
      labels:
        app: turbo-cache
    spec:
      containers:
        - name: turbo-cache
          image: ducktors/turborepo-remote-cache:latest
          ports:
            - containerPort: 3000
          env:
            - name: STORAGE_PROVIDER
              value: s3
            - name: S3_BUCKET
              value: your-turbo-cache-bucket
            - name: S3_REGION
              value: us-east-1
            - name: TURBO_TOKEN
              valueFrom:
                secretKeyRef:
                  name: turbo-cache-secrets
                  key: turbo-token
            - name: TURBO_REMOTE_CACHE_SIGNATURE_KEY
              valueFrom:
                secretKeyRef:
                  name: turbo-cache-secrets
                  key: signature-key
---
apiVersion: v1
kind: Service
metadata:
  name: turbo-cache
  namespace: build-infra
spec:
  selector:
    app: turbo-cache
  ports:
    - port: 80
      targetPort: 3000
```

Store `turbo-token` and `signature-key` in a Kubernetes `Secret` (or retrieve them from your secrets manager via an operator such as External Secrets).

### S3 bucket requirements

- Enable versioning (optional but recommended for artifact integrity auditing).
- Apply a lifecycle rule to expire objects older than 30 days to control storage costs.
- Restrict bucket access to the cache server's IAM role only — no public access.
- Enable server-side encryption (SSE-S3 or SSE-KMS) on the bucket.

---

## Local developer setup

Add to `.env.local` (never commit this file):

```bash
TURBO_TOKEN=<your-secret-token>
TURBO_TEAM=tktaskapp
TURBO_API=https://cache.internal.example.com
TURBO_TELEMETRY_DISABLED=1
```

Turborepo reads these automatically when running any `turbo run` command.

---

## CI setup

Add `TURBO_TOKEN`, `TURBO_TEAM`, and `TURBO_API` as encrypted repository secrets in GitHub → Settings → Secrets and variables → Actions. The workflow files reference them as `${{ secrets.TURBO_TOKEN }}` etc.

---

## Artifact signing

`turbo.json` sets `"signature": true`. With signing enabled:

- Turborepo computes an HMAC over each cache artifact before uploading.
- On download, Turborepo re-verifies the HMAC against `TURBO_REMOTE_CACHE_SIGNATURE_KEY`.
- Artifacts whose signature does not match are rejected, preventing cache poisoning attacks.

`TURBO_REMOTE_CACHE_SIGNATURE_KEY` must be a strong random secret (minimum 32 bytes). Generate one with:

```bash
openssl rand -base64 32
```

Store it only in the cache server's secret store — never in client environment variables or CI secrets.
