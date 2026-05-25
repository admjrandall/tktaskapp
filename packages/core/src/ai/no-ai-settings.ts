type AnyRecord = Record<string, unknown>

export const BROWSER_MODELS: AnyRecord[] = []
export const CLOUD_PROVIDERS: Record<string, AnyRecord> = {}

export function setAISettingsHooks(_hooks: unknown): void {}
export function setAIV2IDBHooks(_hooks: unknown): void {}

export function aiNeedsOnboarding(): boolean {
  return false
}

export function openAIWizard(_step = 1): void {}
export function closeAIWizard(): void {}
export function renderAIWizard(): string {
  return ''
}
export function bindAIWizard(): void {}
export function renderNanoDownloadModal(): string {
  return ''
}
export function bindNanoDownloadModal(): void {}
export function openNanoDownloadModal(): void {}
export function closeNanoDownloadModal(): void {}
export function isNanoModalOpen(): boolean {
  return false
}

export async function aiSecretsRefresh(): Promise<void> {}
export async function aiSecretsLoad(): Promise<Record<string, string>> {
  return {}
}
export async function aiSecretsSave(_secrets: Record<string, string>): Promise<void> {}
export async function aiSecretsWipe(): Promise<void> {}

export async function probeOllama(): Promise<{ state: string }> {
  return { state: 'disabled' }
}

export async function testCloudKey(): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'AI is disabled in this build' }
}

export function aiCurrentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}
