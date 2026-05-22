// ── BUTTON PRIMITIVE ────────────────────────────────────────────────────────
import { escH } from '../../utils.js'

export interface ButtonProps {
  label?: string
  id?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  icon?: string
  iconRight?: string
  type?: 'button' | 'submit' | 'reset'
  ariaLabel?: string
  title?: string
  dataset?: Record<string, string>
  extraClass?: string
  style?: string
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  ghost: 'btn btn-ghost',
  danger: 'btn btn-danger',
  icon: 'btn btn-ghost btn-icon',
}

const SIZE_CLASS: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
}

export function renderButton(p: ButtonProps): string {
  const variant = p.variant ?? 'secondary'
  const size = p.size ?? 'md'
  const variantCls = VARIANT_CLASS[variant]
  const sizeCls = SIZE_CLASS[size]
  const cls = [variantCls, sizeCls, p.extraClass].filter(Boolean).join(' ')

  const dataAttrs = p.dataset
    ? Object.entries(p.dataset)
        .map(([k, v]) => `data-${k}="${escH(v)}"`)
        .join(' ')
    : ''

  const iconHtml = p.icon ? `<span class="btn-icon-slot">${p.icon}</span>` : ''
  const iconRightHtml = p.iconRight ? `<span class="btn-icon-slot">${p.iconRight}</span>` : ''
  const labelHtml = p.label ? `<span>${escH(p.label)}</span>` : ''

  const attrs = [
    `type="${p.type ?? 'button'}"`,
    `class="${cls}"`,
    p.id ? `id="${p.id}"` : '',
    p.disabled ? 'disabled' : '',
    p.ariaLabel ? `aria-label="${escH(p.ariaLabel)}"` : '',
    p.title ? `title="${escH(p.title)}"` : '',
    p.style ? `style="${escH(p.style)}"` : '',
    dataAttrs,
  ]
    .filter(Boolean)
    .join(' ')

  return `<button ${attrs}>${iconHtml}${labelHtml}${iconRightHtml}</button>`
}

export function renderIconButton(
  icon: string,
  opts: Omit<ButtonProps, 'variant' | 'label'> = {},
): string {
  return renderButton({ ...opts, variant: 'icon', icon })
}
