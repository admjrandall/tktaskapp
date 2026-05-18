type AnyRecord = Record<string, unknown>;
type Message = { role: string; content: string };

export interface WebLLMPipeline {
  model: AnyRecord;
  processor: AnyRecord;
  TextStreamer: AnyRecord;
}

function disabled(): never {
  throw new Error('Browser AI is disabled in the offline OT build.');
}

export async function loadNano(): Promise<AnyRecord> {
  disabled();
}

export async function callNano(): Promise<{ text: string; session: AnyRecord }> {
  disabled();
}

export function destroyNanoSession(_session: AnyRecord | null): void {}

export async function loadWebLLM(): Promise<WebLLMPipeline> {
  disabled();
}

export async function callWebLLM(
  _pipeline: WebLLMPipeline,
  _systemPrompt: string,
  _history: Message[],
  _onToken: (text: string) => void,
): Promise<string> {
  disabled();
}
