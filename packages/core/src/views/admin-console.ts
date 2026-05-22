// ── ADMIN CONSOLE ─────────────────────────────────────────────────────────────
// Role-gated admin view. Shows lockdown controls, compliance pack status,
// AI gateway allowlist, and audit chain health. Phase 1 — expandable stub.

import { escH } from '../utils.js'
import { Icons } from '../ui/icons.js'
import { BRAND } from '../branding.js'
import type { AppState } from '../state.js'
import type { LockdownLevel } from '../state.js'

type AnyRecord = Record<string, unknown>

// ── Hook injection ────────────────────────────────────────────────────────────
let _setLockdown: ((level: LockdownLevel) => void) | null = null
let _getLockdownLevel: (() => LockdownLevel) | null = null

export function setAdminConsoleHooks(hooks: {
  setLockdown?: (level: LockdownLevel) => void
  getLockdownLevel?: () => LockdownLevel
}): void {
  if (hooks.setLockdown) _setLockdown = hooks.setLockdown
  if (hooks.getLockdownLevel) _getLockdownLevel = hooks.getLockdownLevel
}

// ── Lockdown section ──────────────────────────────────────────────────────────
function renderLockdownSection(lockdownLevel: LockdownLevel): string {
  const levels: { id: LockdownLevel; label: string; desc: string }[] = [
    { id: 'off', label: 'Off', desc: 'No additional restrictions beyond system defaults.' },
    {
      id: 'standard',
      label: 'Standard',
      desc: 'Tenant-only AI endpoints, immutable audit log, telemetry blocked.',
    },
    {
      id: 'strong',
      label: 'Strong',
      desc: 'Standard + DLP-light warnings on copy/export/external links.',
    },
    {
      id: 'strict',
      label: 'Strict (reserved)',
      desc: 'Strong + hardware-bound keys, no clipboard.',
    },
  ]
  const rows = levels
    .map((lvl) => {
      const isActive = lockdownLevel === lvl.id
      const disabled =
        lvl.id === 'strict' ? ' disabled title="Strict mode is reserved for future use"' : ''
      return `<label style="display:flex;align-items:flex-start;gap:.75rem;padding:.75rem;border-radius:8px;cursor:pointer;background:${isActive ? 'var(--accent-light)' : 'transparent'};border:1px solid ${isActive ? 'var(--accent-muted)' : 'transparent'}">
      <input type="radio" name="lockdown-level" value="${lvl.id}" ${isActive ? 'checked' : ''}${disabled}>
      <div><p style="font-weight:600;font-size:.9375rem">${escH(lvl.label)}${isActive ? ' <span style="font-size:.75rem;color:var(--accent)">(active)</span>' : ''}</p><p style="font-size:.875rem;color:var(--text-secondary);margin-top:.125rem">${escH(lvl.desc)}</p></div>
    </label>`
    })
    .join('')
  return `<div class="settings-section">
    <h3 class="settings-section-title">${Icons.Lock(16)} Lockdown Level (C.7)</h3>
    <p class="settings-section-desc">Controls security gates applied across the client and server.</p>
    <div style="display:flex;flex-direction:column;gap:.5rem">${rows}</div>
  </div>`
}

function renderComplianceSection(): string {
  const packs = [
    {
      id: 'hipaa',
      label: 'HIPAA',
      status: 'inactive',
      desc: 'Healthcare privacy compliance pack. Enables 6-year audit retention.',
    },
    {
      id: 'eu-ai-act',
      label: 'EU AI Act',
      status: 'inactive',
      desc: 'EU AI Act compliance pack. Marks AI attributes as decision-support.',
    },
    {
      id: 'gdpr',
      label: 'GDPR',
      status: 'inactive',
      desc: 'General Data Protection Regulation pack. Enables crypto-shredding erasure.',
    },
  ]
  const rows = packs
    .map(
      (
        p,
      ) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem;border:1px solid var(--border-subtle);border-radius:8px">
    <div><p style="font-weight:600">${escH(p.label)}</p><p style="font-size:.875rem;color:var(--text-secondary)">${escH(p.desc)}</p></div>
    <span class="badge badge-slate">${escH(p.status)}</span>
  </div>`,
    )
    .join('')
  return `<div class="settings-section">
    <h3 class="settings-section-title">Compliance Packs</h3>
    <p class="settings-section-desc">Activate compliance profiles to enforce retention policies and AI governance.</p>
    <div style="display:flex;flex-direction:column;gap:.5rem">${rows}</div>
  </div>`
}

function renderAIGatewaySection(): string {
  return `<div class="settings-section">
    <h3 class="settings-section-title">${Icons.AI(16)} AI Endpoint Allowlist</h3>
    <p class="settings-section-desc">Restrict which AI providers are permitted in this workspace. Enforced by the AI gateway policy engine.</p>
    <div style="background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:8px;padding:.75rem">
      <p style="font-size:.875rem;color:var(--text-secondary)">Allowlist management available in enterprise builds with AI Gateway configured.</p>
    </div>
  </div>`
}

// ── Render ─────────────────────────────────────────────────────────────────────
export function renderAdminConsole(state: AppState): string {
  const lockdownLevel = state.lockdownLevel ?? 'off'
  return `<div id="admin-console" style="max-width:720px;margin:0 auto;padding:2rem 1.5rem">
    <div style="margin-bottom:1.5rem">
      <h2 style="font-size:1.25rem;font-weight:700;color:var(--text-primary)">${escH(BRAND.name)} Admin Console</h2>
      <p style="font-size:.875rem;color:var(--text-secondary);margin-top:.25rem">Visible to admin/owner roles only.</p>
    </div>
    ${renderLockdownSection(lockdownLevel)}
    ${renderComplianceSection()}
    ${renderAIGatewaySection()}
  </div>`
}

export function bindAdminConsole(state: AppState): void {
  document.querySelectorAll<HTMLInputElement>('input[name="lockdown-level"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const level = radio.value as LockdownLevel
      _setLockdown?.(level)
    })
  })
}
