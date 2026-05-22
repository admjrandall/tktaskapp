// ── BADGE PRIMITIVE ─────────────────────────────────────────────────────────
import { escH, formatDate, daysUntil } from '../../utils.js'

export interface BadgeProps {
  label: string
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'ai' | 'slate'
  size?: 'sm' | 'md'
  dot?: boolean
}

const VARIANT_CLASS: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'badge badge-slate',
  primary: 'badge badge-indigo',
  success: 'badge badge-green',
  warning: 'badge badge-amber',
  danger: 'badge badge-rose',
  info: 'badge badge-blue',
  ai: 'badge badge-purple',
  slate: 'badge badge-slate',
}

export function renderBadge(p: BadgeProps): string {
  const cls = VARIANT_CLASS[p.variant ?? 'default']
  const dotHtml = p.dot ? '<span class="badge-dot"></span>' : ''
  return `<span class="${cls}">${dotHtml}${escH(p.label)}</span>`
}

const PRIORITY_VARIANT: Record<string, BadgeProps['variant']> = {
  Low: 'success',
  Medium: 'warning',
  High: 'danger',
  Critical: 'danger',
}

export function renderPriorityBadge(priority: string | null | undefined): string {
  if (!priority) return ''
  return renderBadge({ label: priority, variant: PRIORITY_VARIANT[priority] ?? 'default' })
}

export function renderStatusBadge(status: string | null | undefined): string {
  if (!status) return ''
  const variantMap: Record<string, BadgeProps['variant']> = {
    'In Progress': 'primary',
    Done: 'success',
    Blocked: 'danger',
    Todo: 'default',
    Active: 'success',
    Lead: 'info',
    'On Hold': 'warning',
    Cancelled: 'slate',
    Review: 'warning',
  }
  return renderBadge({ label: status, variant: variantMap[status] ?? 'default' })
}

export function renderDueBadge(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = daysUntil(dateStr)
  if (d === null) return ''
  if (d < 0) return renderBadge({ label: `${Math.abs(d)}d overdue`, variant: 'danger' })
  if (d === 0) return renderBadge({ label: 'Due today', variant: 'warning' })
  if (d <= 3) return renderBadge({ label: `Due in ${d}d`, variant: 'warning' })
  return renderBadge({ label: formatDate(dateStr), variant: 'slate' })
}
