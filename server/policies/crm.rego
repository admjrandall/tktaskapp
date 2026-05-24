package crm

import future.keywords.if
import future.keywords.in

# Default deny
default allow = false

# Tenant isolation — every request must match the token tenant
deny_cross_tenant if {
    input.resourceTenantId != null
    input.resourceTenantId != input.tenantId
}

allow if {
    not deny_cross_tenant
    role_allowed
}

# Admins can do anything
role_allowed if {
    input.role == "admin"
}

# Owners can do anything
role_allowed if {
    input.role == "owner"
}

# Editors can read, create, update — not delete users or erase records
role_allowed if {
    input.role == "editor"
    input.action in {"read", "create", "update"}
}

# Viewers can only read
role_allowed if {
    input.role == "viewer"
    input.action == "read"
}

# Admins only: user management and erasure
role_allowed if {
    input.role in {"admin", "owner"}
    input.action in {"suspend_user", "erase_user", "manage_users"}
}
