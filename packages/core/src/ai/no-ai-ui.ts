export function setAIUIHooks(_hooks: unknown): void {}
export function setAIUISchemas(_schemas: unknown): void {}

export function renderAIPanel(_open: boolean): string {
  return ''
}

export function bindAIPanel(): void {}

export function renderAIChatWorkspace(): string {
  return `<div class="workspace" style="padding:2rem"><h1>AI disabled</h1><p style="color:var(--text-secondary)">This build does not include AI features.</p></div>`
}

export function bindAIChatWorkspace(): void {}

export function streamToBubble(_text: string): void {}
export function finalRender(): void {}
