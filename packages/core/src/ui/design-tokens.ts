// ── DESIGN TOKENS (C.4) ────────────────────────────────────────────────────
// Single source of truth for all visual constants.
// `applyTokens()` writes CSS custom-property overrides onto :root.
// The base palette is defined in styles/main.css; these tokens extend/override it.

export const TOKENS = {
  color: {
    light: {
      bgBase: '#f8fafc',
      bgSurface: '#ffffff',
      bgElevated: '#ffffff',
      bgOverlay: 'rgba(255,255,255,0.75)',
      bgSidebar: '#0f172a',
      bgSidebarHover: '#1e293b',
      bgSidebarActive: '#4f46e5',
      textPrimary: '#0f172a',
      textSecondary: '#64748b',
      textTertiary: '#94a3b8',
      textSidebar: '#cbd5e1',
      textSidebarActive: '#ffffff',
      textInverted: '#ffffff',
      borderSubtle: '#e2e8f0',
      borderDefault: '#cbd5e1',
      borderStrong: '#94a3b8',
      accent: '#4f46e5',
      accentHover: '#4338ca',
      accentLight: '#eef2ff',
      accentMuted: '#e0e7ff',
      statusInfo: '#3b82f6',
      statusInfoLight: '#eff6ff',
      statusSuccess: '#10b981',
      statusSuccessLight: '#ecfdf5',
      statusWarning: '#f59e0b',
      statusWarningLight: '#fffbeb',
      statusDanger: '#ef4444',
      statusDangerLight: '#fef2f2',
      statusAI: '#8b5cf6',
      statusAILight: '#f5f3ff',
    },
    dark: {
      bgBase: '#020617',
      bgSurface: '#0f172a',
      bgElevated: '#1e293b',
      bgOverlay: 'rgba(15,23,42,0.8)',
      bgSidebar: '#020617',
      bgSidebarHover: '#1e293b',
      bgSidebarActive: '#4f46e5',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      textTertiary: '#64748b',
      textSidebar: '#94a3b8',
      textSidebarActive: '#ffffff',
      textInverted: '#0f172a',
      borderSubtle: '#1e293b',
      borderDefault: '#334155',
      borderStrong: '#475569',
      accent: '#6366f1',
      accentHover: '#4f46e5',
      accentLight: '#1e1b4b',
      accentMuted: '#312e81',
      statusInfo: '#60a5fa',
      statusInfoLight: '#1e3a5f',
      statusSuccess: '#34d399',
      statusSuccessLight: '#064e3b',
      statusWarning: '#fbbf24',
      statusWarningLight: '#451a03',
      statusDanger: '#f87171',
      statusDangerLight: '#450a0a',
      statusAI: '#a78bfa',
      statusAILight: '#2e1065',
    },
  },
  spacing: {
    0: '0',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    6: '24px',
    8: '32px',
    12: '48px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '20px',
    full: '9999px',
  },
  motion: {
    fast: '120ms',
    base: '200ms',
    slow: '320ms',
    curve: 'cubic-bezier(0.2,0.8,0.2,1)',
  },
  typography: {
    fontSans: "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
    fontMono: "'SF Mono','Cascadia Code','Fira Code',ui-monospace,monospace",
    sizeSm: '0.8125rem',
    sizeBase: '0.875rem',
    sizeMd: '1rem',
    sizeLg: '1.125rem',
    sizeXl: '1.25rem',
    weight400: '400',
    weight500: '500',
    weight600: '600',
    weight700: '700',
    leadingTight: '1.25',
    leadingBase: '1.5',
    leadingRelaxed: '1.625',
  },
  density: {
    comfortable: { row: '44px', gap: '12px', padV: '0.5rem', padH: '1rem' },
    compact: { row: '32px', gap: '8px', padV: '0.25rem', padH: '0.75rem' },
  },
  shadow: {
    subtle: '0 1px 2px 0 rgba(0,0,0,0.05)',
    raised: '0 4px 6px -1px rgba(0,0,0,0.07),0 2px 4px -2px rgba(0,0,0,0.05)',
    overlay: '0 20px 25px -5px rgba(0,0,0,0.1),0 8px 10px -6px rgba(0,0,0,0.05)',
  },
} as const

export type ColorScale = typeof TOKENS.color.light
export type Theme = 'light' | 'dark'
export type Density = 'comfortable' | 'compact'

// Maps camelCase token keys → CSS custom property names used in styles/main.css
const COLOR_VAR_MAP: Record<keyof ColorScale, string> = {
  bgBase: '--bg-base',
  bgSurface: '--bg-surface',
  bgElevated: '--bg-elevated',
  bgOverlay: '--bg-overlay',
  bgSidebar: '--bg-sidebar',
  bgSidebarHover: '--bg-sidebar-hover',
  bgSidebarActive: '--bg-sidebar-active',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textTertiary: '--text-tertiary',
  textSidebar: '--text-sidebar',
  textSidebarActive: '--text-sidebar-active',
  textInverted: '--text-inverted',
  borderSubtle: '--border-subtle',
  borderDefault: '--border-default',
  borderStrong: '--border-strong',
  accent: '--accent',
  accentHover: '--accent-hover',
  accentLight: '--accent-light',
  accentMuted: '--accent-muted',
  statusInfo: '--color-info',
  statusInfoLight: '--color-info-light',
  statusSuccess: '--color-success',
  statusSuccessLight: '--color-success-light',
  statusWarning: '--color-warning',
  statusWarningLight: '--color-warning-light',
  statusDanger: '--color-danger',
  statusDangerLight: '--color-danger-light',
  statusAI: '--color-ai',
  statusAILight: '--color-ai-light',
}

export function applyTokens(theme: Theme, density: Density): void {
  const root = document.documentElement
  const colors = TOKENS.color[theme] as Record<string, string>
  for (const [key, val] of Object.entries(colors)) {
    const varName = COLOR_VAR_MAP[key as keyof ColorScale]
    if (varName) root.style.setProperty(varName, val)
  }
  const d = TOKENS.density[density]
  root.style.setProperty('--density-row-height', d.row)
  root.style.setProperty('--density-gap', d.gap)
  root.style.setProperty('--density-pad-v', d.padV)
  root.style.setProperty('--density-pad-h', d.padH)
}
