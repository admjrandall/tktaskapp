package crm

import future.keywords.if
import future.keywords.in

# Default deny
default allow = false

# Admins can do anything
allow if {
    input.role == "admin"
}

# Owners can do anything
allow if {
    input.role == "owner"
}

# Editors can read, create, update — not delete users or erase records
allow if {
    input.role == "editor"
    input.action in {"read", "create", "update"}
}

# Viewers can only read
allow if {
    input.role == "viewer"
    input.action == "read"
}

# Tenant isolation — every request must match the token tenant
deny_cross_tenant if {
    input.resourceTenantId != null
    input.resourceTenantId != input.tenantId
}

# Admins only: user management and erasure
allow if {
    input.role in {"admin", "owner"}
    input.action in {"suspend_user", "erase_user", "manage_users"}
}
