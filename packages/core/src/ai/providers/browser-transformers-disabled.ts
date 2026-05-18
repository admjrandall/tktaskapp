export const env: Record<string, unknown> = {};

function disabled(): never {
  throw new Error('Browser model downloads are disabled in the offline OT build.');
}

export const AutoProcessor = {
  from_pretrained: async () => disabled(),
};

export const Gemma4ForConditionalGeneration = {
  from_pretrained: async () => disabled(),
};

export class TextStreamer {
  constructor(..._args: unknown[]) {
    disabled();
  }
}
