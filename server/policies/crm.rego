package crm

import future.keywords.if
import future.keywords.in

# Default deny — every action requires an explicit grant.
default allow = false

# ── Cross-tenant isolation ────────────────────────────────────────────────────
# This is the first check and cannot be overridden by any role rule.
deny_cross_tenant if {
    input.resourceTenantId != null
    input.resourceTenantId != input.tenantId
}

allow if {
    not deny_cross_tenant
    role_allowed
}

# ── Owner — unrestricted within their tenant ──────────────────────────────────
role_allowed if { input.role == "owner" }

# ── Admin — all actions except owner-only ones ────────────────────────────────
role_allowed if {
    input.role == "admin"
    not input.action in owner_only_actions
}

# ── Editor — CRUD on all CRM resources, sync, and AI attribute compute ────────
role_allowed if {
    input.role == "editor"
    input.action in editor_actions
}

# ── Viewer — read and sync pull only ─────────────────────────────────────────
role_allowed if {
    input.role == "viewer"
    input.action in viewer_actions
}

# ── Owner-only actions ────────────────────────────────────────────────────────
# These cannot be delegated to admins. Requires explicit owner authentication.
owner_only_actions := {
    "erase_user",
    "manage_keys",
    "ai:configure",
}

# ── Admin/owner actions ───────────────────────────────────────────────────────
# Admin actions beyond standard CRUD. Owners also inherit these.
admin_actions := {
    "manage_users",
    "suspend_user",
    "manage_ai_allowlist",
    "manage_integrations",
    "manage_org_settings",
    "view_audit",
    "export_audit",
    # Legacy aliases kept for backward compat while routes migrate
    "admin:delete-user",
    "admin:manage-keys",
    "admin:view-audit",
}

role_allowed if {
    input.role in {"admin", "owner"}
    input.action in admin_actions
}

# ── Editor actions ────────────────────────────────────────────────────────────
editor_actions := {
    "read",
    "create",
    "update",
    "delete",
    "sync:pull",
    "sync:push",
    "sync:stream",
    "ai:compute_attribute",
}

# ── Viewer actions ────────────────────────────────────────────────────────────
viewer_actions := {
    "read",
    "sync:pull",
    "sync:stream",
}
