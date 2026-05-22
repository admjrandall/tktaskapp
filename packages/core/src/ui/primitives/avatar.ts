// ── AVATAR PRIMITIVE ─────────────────────────────────────────────────────────
import { escH, initials, avatarColor } from '../../utils.js'

export interface AvatarProps {
  name?: string | null | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  src?: string
  colorPair?: [string, string]
  title?: string
  style?: string
}

const SIZE_PX: Record<NonNullable<AvatarProps['size']>, number> = {
  xs: 24,
  sm: 28,
  md: 32,
  lg: 40,
  xl: 56,
}

const SIZE_FONT: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: '.65rem',
  sm: '.7rem',
  md: '.8rem',
  lg: '.9375rem',
  xl: '1.125rem',
}

export function renderAvatar(p: AvatarProps): string {
  const size = p.size ?? 'md'
  const px = SIZE_PX[size]
  const fs = SIZE_FONT[size]
  const [bg, fg] = p.colorPair ?? avatarColor(p.name)
  const titleAttr = p.title ? ` title="${escH(p.title)}"` : ''
  const baseStyle = `width:${px}px;height:${px}px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:${fs};font-weight:600;flex-shrink:0`

  if (p.src) {
    return `<img src="${escH(p.src)}" alt="${escH(p.name ?? '')}" style="${baseStyle}${p.style ? ';' + p.style : ''}" loading="lazy"${titleAttr}>`
  }

  const bg2 = escH(bg)
  const fg2 = escH(fg)
  const styleStr = `${baseStyle};background:${bg2};color:${fg2}${p.style ? ';' + p.style : ''}`
  return `<div class="avatar avatar-${size}" style="${styleStr}"${titleAttr}>${escH(initials(p.name))}</div>`
}

export function renderAvatarGroup(
  people: AvatarProps[],
  max = 3,
  size: AvatarProps['size'] = 'sm',
): string {
  const shown = people.slice(0, max)
  const extra = people.length - max
  const avatars = shown
    .map((p) => renderAvatar({ ...p, size, style: 'border:2px solid var(--bg-surface)' }))
    .join('')
  const extraBadge =
    extra > 0
      ? `<div style="width:${SIZE_PX[size]}px;height:${SIZE_PX[size]}px;border-radius:50%;background:var(--bg-elevated);border:2px solid var(--bg-surface);display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:600;color:var(--text-secondary)">+${extra}</div>`
      : ''
  return `<div style="display:flex;align-items:center">${avatars}${extraBadge}</div>`
}
