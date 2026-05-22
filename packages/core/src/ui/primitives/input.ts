// ── INPUT PRIMITIVES ─────────────────────────────────────────────────────────
import { escH } from '../../utils.js'

export interface InputProps {
  id?: string
  name?: string
  type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url' | 'date'
  value?: string | number | null
  placeholder?: string
  required?: boolean
  disabled?: boolean
  readonly?: boolean
  label?: string
  error?: string
  hint?: string
  size?: 'sm' | 'md'
  autocomplete?: string
  min?: string
  max?: string
  step?: string
  pattern?: string
  style?: string
  extraClass?: string
  dataset?: Record<string, string>
}

function dataAttrs(d?: Record<string, string>): string {
  if (!d) return ''
  return Object.entries(d)
    .map(([k, v]) => `data-${k}="${escH(v)}"`)
    .join(' ')
}

export function renderInput(p: InputProps): string {
  const inputCls = [
    'input',
    p.size === 'sm' ? 'input-sm' : '',
    p.error ? 'input-error' : '',
    p.extraClass,
  ]
    .filter(Boolean)
    .join(' ')
  const attrs = [
    `type="${p.type ?? 'text'}"`,
    `class="${inputCls}"`,
    p.id ? `id="${p.id}"` : '',
    p.name ? `name="${p.name}"` : '',
    p.value != null ? `value="${escH(p.value)}"` : '',
    p.placeholder ? `placeholder="${escH(p.placeholder)}"` : '',
    p.required ? 'required' : '',
    p.disabled ? 'disabled' : '',
    p.readonly ? 'readonly' : '',
    p.autocomplete ? `autocomplete="${escH(p.autocomplete)}"` : '',
    p.min ? `min="${escH(p.min)}"` : '',
    p.max ? `max="${escH(p.max)}"` : '',
    p.step ? `step="${escH(p.step)}"` : '',
    p.pattern ? `pattern="${escH(p.pattern)}"` : '',
    p.style ? `style="${escH(p.style)}"` : '',
    dataAttrs(p.dataset),
  ]
    .filter(Boolean)
    .join(' ')

  const labelHtml = p.label
    ? `<label class="form-label"${p.id ? ` for="${p.id}"` : ''}>${escH(p.label)}${p.required ? ' <span style="color:var(--color-danger)">*</span>' : ''}</label>`
    : ''
  const errorHtml = p.error ? `<p class="form-error">${escH(p.error)}</p>` : ''
  const hintHtml = p.hint && !p.error ? `<p class="form-hint">${escH(p.hint)}</p>` : ''

  return `<div class="form-field">${labelHtml}<input ${attrs}>${errorHtml}${hintHtml}</div>`
}

export interface TextareaProps extends Omit<
  InputProps,
  'type' | 'min' | 'max' | 'step' | 'pattern'
> {
  rows?: number
}

export function renderTextarea(p: TextareaProps): string {
  const cls = [
    'textarea',
    p.size === 'sm' ? 'textarea-sm' : '',
    p.error ? 'input-error' : '',
    p.extraClass,
  ]
    .filter(Boolean)
    .join(' ')
  const attrs = [
    `class="${cls}"`,
    p.id ? `id="${p.id}"` : '',
    p.name ? `name="${p.name}"` : '',
    p.rows ? `rows="${p.rows}"` : 'rows="4"',
    p.placeholder ? `placeholder="${escH(p.placeholder)}"` : '',
    p.required ? 'required' : '',
    p.disabled ? 'disabled' : '',
    p.readonly ? 'readonly' : '',
    p.style ? `style="${escH(p.style)}"` : '',
    dataAttrs(p.dataset),
  ]
    .filter(Boolean)
    .join(' ')

  const val = p.value != null ? escH(p.value) : ''
  const labelHtml = p.label
    ? `<label class="form-label"${p.id ? ` for="${p.id}"` : ''}>${escH(p.label)}${p.required ? ' <span style="color:var(--color-danger)">*</span>' : ''}</label>`
    : ''
  const errorHtml = p.error ? `<p class="form-error">${escH(p.error)}</p>` : ''
  const hintHtml = p.hint && !p.error ? `<p class="form-hint">${escH(p.hint)}</p>` : ''

  return `<div class="form-field">${labelHtml}<textarea ${attrs}>${val}</textarea>${errorHtml}${hintHtml}</div>`
}

export interface SelectProps extends Omit<InputProps, 'type' | 'min' | 'max' | 'step' | 'pattern'> {
  options: { value: string; label: string; disabled?: boolean }[]
  emptyLabel?: string
}

export function renderSelect(p: SelectProps): string {
  const cls = [
    'select',
    p.size === 'sm' ? 'select-sm' : '',
    p.error ? 'input-error' : '',
    p.extraClass,
  ]
    .filter(Boolean)
    .join(' ')
  const attrs = [
    `class="${cls}"`,
    p.id ? `id="${p.id}"` : '',
    p.name ? `name="${p.name}"` : '',
    p.required ? 'required' : '',
    p.disabled ? 'disabled' : '',
    p.style ? `style="${escH(p.style)}"` : '',
    dataAttrs(p.dataset),
  ]
    .filter(Boolean)
    .join(' ')

  const emptyOpt =
    p.emptyLabel !== undefined ? `<option value="">${escH(p.emptyLabel)}</option>` : ''
  const opts = p.options
    .map((o) => {
      const sel = String(p.value ?? '') === o.value ? ' selected' : ''
      const dis = o.disabled ? ' disabled' : ''
      return `<option value="${escH(o.value)}"${sel}${dis}>${escH(o.label)}</option>`
    })
    .join('')

  const labelHtml = p.label
    ? `<label class="form-label"${p.id ? ` for="${p.id}"` : ''}>${escH(p.label)}${p.required ? ' <span style="color:var(--color-danger)">*</span>' : ''}</label>`
    : ''
  const errorHtml = p.error ? `<p class="form-error">${escH(p.error)}</p>` : ''
  const hintHtml = p.hint && !p.error ? `<p class="form-hint">${escH(p.hint)}</p>` : ''

  return `<div class="form-field">${labelHtml}<select ${attrs}>${emptyOpt}${opts}</select>${errorHtml}${hintHtml}</div>`
}
