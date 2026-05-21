// ── UTILS ──────────────────────────────────────────────────────────────
// Extracted from taskapp.html ~3197–3227
// Pure helpers used everywhere — no module dependencies aside from constants.

import { AVATAR_COLORS } from './constants.js'

export function sanitize(s: unknown, max = 10000): string {
  return typeof s === 'string' ? s.trim().slice(0, max) : ''
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = parseDateLocal(iso) || new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(iso)
}

export function formatDuration(s: number): string {
  if (!s) return '0:00:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sc = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`
}

export function formatFileSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

export function parseDateLocal(ds: string | null | undefined): Date | null {
  if (!ds) return null
  const m = ds.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return new Date(ds)
  return new Date(+m[1]!, +m[2]! - 1, +m[3]!)
}

export function daysUntil(ds: string | null | undefined): number | null {
  if (!ds) return null
  const d = parseDateLocal(ds)
  if (!d) return null
  d.setHours(0, 0, 0, 0)
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

export function initials(n: string | null | undefined): string {
  if (!n) return '?'
  return n
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function avatarColor(s: string | null | undefined): [string, string] {
  if (!s) return AVATAR_COLORS[0]!
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!
}

type AnyRec = Record<string, unknown>

export function sortRecords<T extends AnyRec>(
  recs: T[],
  field: string,
  dir: 'asc' | 'desc' = 'asc',
): T[] {
  return [...recs].sort((a: AnyRec, b: AnyRec) => {
    let va: unknown = a[field] ?? ''
    let vb: unknown = b[field] ?? ''
    if (['createdAt', 'updatedAt', 'dueDate'].includes(field)) {
      va = va ? new Date(va as string).getTime() : 0
      vb = vb ? new Date(vb as string).getTime() : 0
    }
    if ((va as number | string) < (vb as number | string)) return dir === 'asc' ? -1 : 1
    if ((va as number | string) > (vb as number | string)) return dir === 'asc' ? 1 : -1
    return 0
  })
}

export function filterRecords<T extends AnyRec>(recs: T[], filters: Record<string, unknown>): T[] {
  return recs.filter((r: AnyRec) => {
    for (const [k, v] of Object.entries(filters)) {
      if (!v || v === 'all') continue
      const rv = r[k]
      if (Array.isArray(rv)) {
        if (!rv.includes(v)) return false
      } else {
        const rvStr =
          typeof rv === 'string' || typeof rv === 'number' || typeof rv === 'boolean'
            ? String(rv)
            : ''
        const vStr =
          typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''
        if (rvStr.toLowerCase() !== vStr.toLowerCase()) return false
      }
    }
    return true
  })
}

export function searchRecords<T extends AnyRec>(recs: T[], q: string, fields: string[]): T[] {
  if (!q) return recs
  const lq = q.toLowerCase()
  return recs.filter((r: AnyRec) =>
    fields.some((f) => {
      const v = r[f]
      return (
        (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') &&
        String(v).toLowerCase().includes(lq)
      )
    }),
  )
}

export function debounce<F extends (...a: unknown[]) => unknown>(
  fn: F,
  ms: number,
): (...a: Parameters<F>) => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...a: Parameters<F>) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...(a as unknown[])), ms)
  }
}

export function downloadText(name: string, content: BlobPart, mime = 'text/plain'): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: mime }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export function toCSV(recs: AnyRec[], fields: string[]): string {
  if (!recs.length) return ''
  const cell = (v: unknown): string => {
    let sv: string
    if (v === null || v === undefined) {
      sv = ''
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      sv = String(v)
    } else {
      sv = JSON.stringify(v)
    }
    return `"${sv.replace(/"/g, '""')}"`
  }
  return [fields.join(','), ...recs.map((r) => fields.map((f) => cell(r[f])).join(','))].join('\n')
}

export function plural(n: number, w: string): string {
  return `${n} ${w}${n === 1 ? '' : 's'}`
}

export function readFileAsText(file: Blob): Promise<string> {
  return new Promise((r, j) => {
    const fr = new FileReader()
    fr.onload = (e) => {
      r(e.target!.result as string)
    }
    fr.onerror = j
    fr.readAsText(file)
  })
}

export function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((r, j) => {
    const fr = new FileReader()
    fr.onload = (e) => {
      r(e.target!.result as string)
    }
    fr.onerror = j
    fr.readAsDataURL(file)
  })
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

export function escH(s: unknown): string {
  const str =
    s === null || s === undefined
      ? ''
      : typeof s === 'string' || typeof s === 'number' || typeof s === 'boolean'
        ? String(s)
        : ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\n/g, '<br>')
}
