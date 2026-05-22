// ── ONBOARDING ────────────────────────────────────────────────────────────────
// First-run 3-card persona picker. Rendered before auth when no vault exists.
// render/bind contract: renderOnboarding() → string, bindOnboarding() → void

import { escH } from '../utils.js'
import { Icons } from '../ui/icons.js'
import { BRAND } from '../branding.js'
import type { PersonaId } from '../state.js'

export interface OnboardingCard {
  id: PersonaId
  title: string
  desc: string
  icon: string
  accentColor: string
}

export const PERSONA_CARDS: OnboardingCard[] = [
  {
    id: 'closer',
    title: BRAND.onboarding.closerTitle,
    desc: BRAND.onboarding.closerDesc,
    icon: Icons.Projects(),
    accentColor: '#4f46e5',
  },
  {
    id: 'maintainer',
    title: BRAND.onboarding.maintainerTitle,
    desc: BRAND.onboarding.maintainerDesc,
    icon: Icons.Tasks(),
    accentColor: '#0891b2',
  },
  {
    id: 'investigator',
    title: BRAND.onboarding.investigatorTitle,
    desc: BRAND.onboarding.investigatorDesc,
    icon: Icons.Reports(),
    accentColor: '#7c3aed',
  },
  {
    id: 'builder',
    title: BRAND.onboarding.builderTitle,
    desc: BRAND.onboarding.builderDesc,
    icon: Icons.Dashboard(),
    accentColor: '#0f766e',
  },
  {
    id: 'inspector',
    title: BRAND.onboarding.inspectorTitle,
    desc: BRAND.onboarding.inspectorDesc,
    icon: Icons.Settings(),
    accentColor: '#b45309',
  },
]

let _onPersonaSelect: ((id: PersonaId) => void) | null = null

export function setOnboardingHooks(onPersonaSelect: (id: PersonaId) => void): void {
  _onPersonaSelect = onPersonaSelect
}

function renderPersonaCard(card: OnboardingCard): string {
  return `<button
    class="onboarding-card"
    data-persona="${card.id}"
    style="background:var(--bg-surface);border:2px solid var(--border-subtle);border-radius:16px;padding:1.5rem;text-align:left;cursor:pointer;transition:border-color 200ms,box-shadow 200ms;display:flex;flex-direction:column;gap:.75rem;min-height:160px"
    aria-label="${escH(card.title)}: ${escH(card.desc)}"
  >
    <div style="width:40px;height:40px;border-radius:10px;background:${escH(card.accentColor)}18;display:flex;align-items:center;justify-content:center;color:${escH(card.accentColor)}">${card.icon}</div>
    <div>
      <p style="font-weight:600;font-size:1rem;color:var(--text-primary)">${escH(card.title)}</p>
      <p style="font-size:.875rem;color:var(--text-secondary);margin-top:.25rem;line-height:1.5">${escH(card.desc)}</p>
    </div>
  </button>`
}

export function renderOnboarding(): string {
  const cards = PERSONA_CARDS.slice(0, 3)
  return `<div id="onboarding-view" style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg-base);padding:2rem">
    <div style="max-width:700px;width:100%;text-align:center">
      <div style="width:56px;height:56px;border-radius:16px;background:var(--accent);display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:1.25rem;font-weight:700;margin-bottom:1.5rem">${escH(BRAND.logoMark)}</div>
      <h1 style="font-size:1.75rem;font-weight:700;color:var(--text-primary);margin-bottom:.5rem">${escH(BRAND.onboarding.welcomeTitle)}</h1>
      <p style="color:var(--text-secondary);font-size:1rem;margin-bottom:2rem;max-width:480px;margin-inline:auto;line-height:1.6">${escH(BRAND.onboarding.welcomeSub)}</p>
      <p style="font-size:.8125rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-tertiary);margin-bottom:1rem">Choose your focus</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem">
        ${cards.map(renderPersonaCard).join('')}
      </div>
      <p style="font-size:.8125rem;color:var(--text-tertiary)">
        You can change this any time in Settings.
        <button class="btn btn-ghost btn-sm" id="onboarding-skip" style="margin-left:.5rem">Skip for now</button>
      </p>
    </div>
  </div>`
}

export function bindOnboarding(): void {
  document.querySelectorAll<HTMLElement>('[data-persona]').forEach((btn) => {
    btn.addEventListener('mouseenter', () => {
      btn.style.borderColor = 'var(--accent)'
      btn.style.boxShadow = 'var(--shadow-md)'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.borderColor = 'var(--border-subtle)'
      btn.style.boxShadow = 'none'
    })
    btn.addEventListener('click', () => {
      const id = btn.dataset['persona'] as PersonaId
      _onPersonaSelect?.(id)
    })
  })

  document.getElementById('onboarding-skip')?.addEventListener('click', () => {
    _onPersonaSelect?.('maintainer')
  })
}
