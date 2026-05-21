# API CHANGELOG

All notable changes to the Task App CRM API are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
API versions follow the URL path prefix (`/api/v1`, `/api/v2`, ...).
Breaking changes always produce a new version prefix.

---

## [Unreleased — v1 design scaffold]

**Status:** Design only. No server implementation exists yet (Phase 9+).
All paths in `docs/api/openapi.yaml` are stubs.

### Added

- OpenAPI 3.1 skeleton with OIDC/PKCE Bearer security scheme
- Stub paths: `/api/v1/clients`, `/api/v1/projects`, `/api/v1/tasks`,
  `/api/v1/documents`, `/api/v1/audit`, `/api/v1/admin/users`
- GDPR Article 17 erasure endpoint: `POST /api/v1/admin/users/{id}/erase`
- Audit log export endpoint: `GET /api/v1/audit/export`
- Shared response schemas: `Error`, `Pagination`, `AuditMeta`
- DPoP token binding documented as near-term addition (RFC 9449)

---

## Versioning policy

### What constitutes a breaking change (requires new version prefix)

- Removing an endpoint or HTTP method
- Removing a required request field
- Removing or renaming a response field that clients depend on
- Changing an enum to exclude previously valid values
- Changing authentication requirements in a way that breaks existing clients
- Changing error code values

### What does NOT require a new version prefix

- Adding new optional request fields
- Adding new optional response fields (clients must tolerate unknown fields)
- Adding new endpoints
- Adding new enum values (clients must tolerate unknown enum values)
- Fixing documentation errors

### Deprecation process

1. Mark the endpoint/field as `deprecated: true` in `openapi.yaml`
2. Add a deprecation notice in this CHANGELOG
3. Maintain the deprecated element for at least one full release cycle (≥ 3 months)
4. Remove in the next major version increment

### Client compatibility requirements

API clients must:

- Tolerate unknown JSON fields in responses (forward compatibility)
- Tolerate unknown enum values (treat as the default/unknown case)
- Check `Content-Type` rather than assuming response format
- Respect `Retry-After` headers on 429 responses
- Implement exponential backoff with jitter for retry logic
