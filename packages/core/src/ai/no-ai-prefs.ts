export const aiPrefs = {
  tier: null as string | null,
  hasCompletedOnboarding: true,
  nanoDisclaimerAcknowledged: true,
}

export function saveAIPrefs(_prefs = aiPrefs): void {}

export function loadAIPrefs(): typeof aiPrefs {
  return aiPrefs
}

export function syncAIPrefsLegacy(): void {}
