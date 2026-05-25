type AnyRecord = Record<string, unknown>

function disabled(): never {
  throw new Error('Ollama AI is disabled in this build.')
}

export async function loadOllama(): Promise<void> {
  disabled()
}

export async function callOllama(): Promise<string> {
  disabled()
}

export async function fetchOllamaModels(): Promise<AnyRecord[]> {
  return []
}

export async function probeOllama(): Promise<{ state: string; error?: string }> {
  return { state: 'disabled', error: 'Ollama AI is disabled in this build' }
}

export async function pullOllamaModel(): Promise<void> {
  disabled()
}

export async function deleteOllamaModel(): Promise<void> {
  disabled()
}
