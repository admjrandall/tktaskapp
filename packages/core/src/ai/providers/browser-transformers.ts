// ── IN-BROWSER (WEBGPU/TRANSFORMERS.JS) PROVIDER ─────────────────────────────
// Loads Gemma 4 via bundled @huggingface/transformers + WebGPU.

import {
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  TextStreamer,
  env,
} from '@huggingface/transformers'

type AnyRecord = Record<string, unknown>
type Message = { role: string; content: string }

export interface WebLLMPipeline {
  model: AnyRecord
  processor: AnyRecord
  TextStreamer: AnyRecord
}

const BROWSER_MODEL_HF: Record<string, string> = {
  'gemma-e2b': 'onnx-community/gemma-4-E2B-it-ONNX',
  'gemma-e4b': 'onnx-community/gemma-4-E4B-it-ONNX',
}

// ── Connection ─────────────────────────────────────────────────────────────────

export async function loadWebLLM(
  updateTxt: (msg: string) => void,
  onProgress: (pct: number) => void,
  modelId: string,
): Promise<WebLLMPipeline> {
  updateTxt('Loading transformers.js + WebGPU…')
  if (!('gpu' in navigator))
    throw new Error('WebGPU not supported. Use Chrome/Edge 113+ on desktop.')
  const hfEnv = env as AnyRecord
  hfEnv['allowLocalModels'] = false
  hfEnv['useBrowserCache'] = true

  const hfModelId = BROWSER_MODEL_HF[modelId] || BROWSER_MODEL_HF['gemma-e2b']
  updateTxt(`Loading ${hfModelId}…`)

  const progress_callback = (p: AnyRecord) => {
    if (p['status'] === 'progress' && p['total']) {
      const pct = (Number(p['loaded']) || 0) / Number(p['total'])
      onProgress(pct)
      updateTxt(`Loading ${p['file'] || 'model'}: ${Math.round(pct * 100)}%`)
    } else if (p['status'] === 'ready') {
      updateTxt('Compiling model on GPU…')
    } else if (p['status'] === 'initiate' || p['status'] === 'download') {
      updateTxt(`Fetching ${p['file'] || 'weights'}…`)
    }
  }

  const processor = await (
    (AutoProcessor as unknown as AnyRecord)['from_pretrained'] as (
      ...a: unknown[]
    ) => Promise<AnyRecord>
  )(hfModelId, { progress_callback })
  const model = await (
    (Gemma4ForConditionalGeneration as unknown as AnyRecord)['from_pretrained'] as (
      ...a: unknown[]
    ) => Promise<AnyRecord>
  )(hfModelId, {
    dtype: 'q4f16',
    device: 'webgpu',
    progress_callback,
  })

  // Warm-up pass
  updateTxt('Warming up…')
  const warmMsg = (processor['apply_chat_template'] as (...a: unknown[]) => unknown)(
    [{ role: 'user', content: 'Reply with one word: ready' }],
    { enable_thinking: false, add_generation_prompt: true },
  )
  const warmIn = await (processor as unknown as (...a: unknown[]) => Promise<AnyRecord>)(
    warmMsg,
    null,
    null,
    { add_special_tokens: false },
  )
  let warm = ''
  const warmStreamer = new (TextStreamer as unknown as new (...a: unknown[]) => unknown)(
    processor['tokenizer'],
    {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (t: string) => {
        warm += t
      },
    },
  )
  await (model['generate'] as (...a: unknown[]) => Promise<unknown>)({
    ...warmIn,
    max_new_tokens: 8,
    do_sample: false,
    streamer: warmStreamer,
  })
  if (!warm) throw new Error('Warmup returned no output')

  return { model, processor, TextStreamer: TextStreamer as unknown as AnyRecord }
}

// ── Inference ──────────────────────────────────────────────────────────────────

export async function callWebLLM(
  pipeline: WebLLMPipeline,
  systemPrompt: string,
  history: Message[],
  onToken: (text: string) => void,
): Promise<string> {
  const { model, processor, TextStreamer } = pipeline
  if (!model || !processor) throw new Error('In-browser model not loaded')

  const messages = [{ role: 'system', content: systemPrompt }, ...history]
  const proc = processor
  const mdl = model
  const TS = TextStreamer as unknown as new (...a: unknown[]) => unknown

  const prompt = (proc['apply_chat_template'] as (...a: unknown[]) => unknown)(messages, {
    enable_thinking: false,
    add_generation_prompt: true,
  })
  const inputs = await (proc as unknown as (...a: unknown[]) => Promise<AnyRecord>)(
    prompt,
    null,
    null,
    { add_special_tokens: false },
  )

  let full = ''
  const streamer = new TS(proc['tokenizer'], {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => {
      full += text
      onToken(full)
    },
  })
  await (mdl['generate'] as (...a: unknown[]) => Promise<unknown>)({
    ...inputs,
    max_new_tokens: 512,
    do_sample: false,
    streamer,
  })
  return (full || '').trim()
}
