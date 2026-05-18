type DisabledCallResult = { text: string; tokensIn: number; tokensOut: number };

function disabled(): never {
  throw new Error('Cloud AI is disabled in the offline OT build.');
}

export async function callAnthropic(): Promise<DisabledCallResult> {
  disabled();
}

export async function callOpenAI(): Promise<DisabledCallResult> {
  disabled();
}

export async function callGoogle(): Promise<DisabledCallResult> {
  disabled();
}

export async function testAnthropicKey(): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Cloud AI is disabled in this build' };
}

export async function testOpenAIKey(): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Cloud AI is disabled in this build' };
}

export async function testGoogleKey(): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Cloud AI is disabled in this build' };
}
