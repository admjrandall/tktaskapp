// ── SETTINGS (USER) ──────────────────────────────────────────────────────────
// User-facing settings shim. Delegates to settings.ts while the full split
// is completed in a subsequent phase. Admin sections live in admin-console.ts.
//
// Import from this file for user settings, from admin-console.ts for admin.

export {
  renderSettings,
  bindSettings,
  setSettingsFsHooks,
  setSettingsAIHooks,
  setSettingsSection,
  setSettingsSecurityHooks,
} from './settings.js'
