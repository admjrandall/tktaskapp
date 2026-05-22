// ── BRANDING ─────────────────────────────────────────────────────────────────
// Central source for all user-facing product strings.
// Migration-locked IDB/TrustedTypes keys are NOT here — see constants.ts.
// Every render that shows the product name reads from BRAND.

export const BRAND = {
  name: 'TechKey CRM',
  shortName: 'TK CRM',
  tagline: 'Your offline-first CRM',
  logoMark: 'TK',
  supportEmail: 'support@techkeydeveloper.com',
  docsUrl: '',
  version: '1.0.0',

  // AI product identity
  aiAssistantName: 'TK AI',
  aiAssistantDesc: 'Your on-device AI assistant',

  // Onboarding copy
  onboarding: {
    welcomeTitle: 'Welcome to TechKey CRM',
    welcomeSub:
      'Set up your workspace in seconds. Your data stays on your device — always private.',
    closerTitle: 'Closer',
    closerDesc: 'Optimised for pipeline management, deals, and client communications.',
    maintainerTitle: 'Maintainer',
    maintainerDesc: 'Focused on ongoing client relationships, projects, and task tracking.',
    investigatorTitle: 'Investigator',
    investigatorDesc: 'Deep-dive analytics, reports, and audit visibility.',
    builderTitle: 'Builder',
    builderDesc: 'Project management, tasks, and team coordination.',
    inspectorTitle: 'Inspector',
    inspectorDesc: 'Compliance, security, and admin tooling.',
  },

  // Lockdown UI strings
  lockdown: {
    bannerStandard: 'Standard security mode active.',
    bannerStrong: 'Strong lockdown active — some features restricted.',
    bannerStrict: 'Strict lockdown active — hardware-bound keys enforced.',
  },
} as const

export type BrandKey = keyof typeof BRAND
