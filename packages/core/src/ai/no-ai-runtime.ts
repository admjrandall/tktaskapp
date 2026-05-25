type AnyRecord = Record<string, unknown>
type Message = { role: string; content: string }

export const STATIC_MODELS: AnyRecord[] = []

export const aiRuntime = {
  ready: false,
  loadStarted: false,
  backend: null as string | null,
  streaming: false,
  history: [] as Message[],
  pendingAction: null as AnyRecord | null,
  downloadProgress: null as AnyRecord | null,
  conversationId: null as string | null,
  savedMessageCount: 0,
  lastProvenance: null as AnyRecord | null,
  lastCommandIntent: null as string | null,
  _aiSecrets: {} as Record<string, string>,
  _aiWizard: null as AnyRecord | null,
  _nanoModal: null as AnyRecord | null,
}

export function setRuntimeHooks(_hooks: unknown): void {}
export function setRuntimeSecretsGetter(_getter: unknown): void {}
export function setRuntimeUsageTracker(_tracker: unknown): void {}
export function setRuntimeCloudLabelGetters(_getters: unknown): void {}
export function setRuntimePromptBuilder(_builder: unknown): void {}

export function setActiveConversation(id: string | null): void {
  aiRuntime.conversationId = id
  aiRuntime.history = []
  aiRuntime.savedMessageCount = 0
}

export async function saveConversationMessages(): Promise<void> {}

export async function startAILoad(): Promise<void> {
  throw new Error('AI is disabled in this build.')
}

export async function disconnectAI(): Promise<void> {
  aiRuntime.ready = false
  aiRuntime.loadStarted = false
  aiRuntime.backend = null
  aiRuntime.streaming = false
}

export async function callBackend(): Promise<string> {
  throw new Error('AI is disabled in this build.')
}

export function modelChipLabel(): string {
  return 'AI disabled'
}

export function backendSubtitle(): string {
  return 'AI disabled'
}

export function backendLabel(): string {
  return 'AI disabled'
}

export function activeModelId(): string | null {
  return null
}

export function preferredModelId(): string | null {
  return null
}

export async function fetchOllamaModels(): Promise<AnyRecord[]> {
  return []
}

export function selectModel(): void {}
export function buildProvenance(): AnyRecord {
  return {}
}
