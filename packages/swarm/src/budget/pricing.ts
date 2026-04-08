/**
 * Per-model pricing tables for budget normalization.
 *
 * Prices are in USD per 1M tokens. Updated to reflect published rates.
 */

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'opus': { inputPer1M: 15.00, outputPer1M: 75.00 },
  'claude-opus-4-6': { inputPer1M: 15.00, outputPer1M: 75.00 },
  'sonnet': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'claude-sonnet-4-6': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'haiku': { inputPer1M: 0.25, outputPer1M: 1.25 },
  'claude-haiku-4-5': { inputPer1M: 0.25, outputPer1M: 1.25 },

  // Google
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.00 },
  'gemini-2.5-flash': { inputPer1M: 0.15, outputPer1M: 0.60 },
  'pro': { inputPer1M: 1.25, outputPer1M: 10.00 },
  'flash': { inputPer1M: 0.15, outputPer1M: 0.60 },

  // OpenAI
  'gpt-5.x': { inputPer1M: 2.50, outputPer1M: 10.00 },
  'gpt-4.1': { inputPer1M: 2.00, outputPer1M: 8.00 },
  'o3': { inputPer1M: 10.00, outputPer1M: 40.00 },

  // Free / BYOK
  'byok': { inputPer1M: 0, outputPer1M: 0 },
  'free': { inputPer1M: 0, outputPer1M: 0 },
};

export function getModelPricing(model: string): ModelPricing {
  const key = model.toLowerCase();
  return PRICING[key] ?? { inputPer1M: 1.00, outputPer1M: 5.00 };
}

export function estimateCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(model);
  return (inputTokens / 1_000_000) * pricing.inputPer1M +
         (outputTokens / 1_000_000) * pricing.outputPer1M;
}

export function getCheapestModel(executorId: string): string {
  switch (executorId) {
    case 'hermes': return 'byok';
    case 'gemini': return 'flash';
    case 'codex': return 'gpt-4.1';
    case 'claude-code': return 'haiku';
    default: return 'byok';
  }
}
