export type OpenAiUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  webSearchCalls: number;
};

type TokenPrices = {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
};

export const AI_PREDICTION_MODELS = [
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { id: "gpt-6-astra", label: "GPT-6 Astra" },
] as const;

export type AiPredictionModel = (typeof AI_PREDICTION_MODELS)[number]["id"];

export function isAiPredictionModel(model: string): model is AiPredictionModel {
  return AI_PREDICTION_MODELS.some((candidate) => candidate.id === model);
}

const PRICE_MICROUSD_PER_TOKEN: Record<string, TokenPrices> = {
  "gpt-6-astra": {
    input: 10,
    cachedInput: 1,
    cacheWrite: 12.5,
    output: 50,
  },
  "gpt-5.6-sol": {
    input: 4,
    cachedInput: 0.4,
    cacheWrite: 5,
    output: 20,
  },
  "gpt-5.6-terra": {
    input: 2,
    cachedInput: 0.2,
    cacheWrite: 2.5,
    output: 12,
  },
  "gpt-5.6-luna": {
    input: 0.2,
    cachedInput: 0.02,
    cacheWrite: 0.25,
    output: 1.2,
  },
  "gpt-5-mini": {
    input: 0.25,
    cachedInput: 0.025,
    cacheWrite: 0.25,
    output: 2,
  },
  "gpt-5-nano": {
    input: 0.05,
    cachedInput: 0.005,
    cacheWrite: 0.05,
    output: 0.4,
  },
};

const WEB_SEARCH_MICROUSD = 10_000;
const TYPICAL_PREDICTION_USAGE: OpenAiUsage = {
  inputTokens: 30_000,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 3_000,
  webSearchCalls: 1,
};

function pricesFor(model: string): TokenPrices {
  const alias = Object.keys(PRICE_MICROUSD_PER_TOKEN).find(
    (candidate) => model === candidate || model.startsWith(`${candidate}-`)
  );
  if (!alias) {
    throw new Error(`No AI budget pricing configured for model ${model}`);
  }
  return PRICE_MICROUSD_PER_TOKEN[alias]!;
}

export function estimateOpenAiCostMicrousd(
  model: string,
  usage: OpenAiUsage
): number {
  const prices = pricesFor(model);
  const uncachedInputTokens = Math.max(
    0,
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens
  );

  return Math.ceil(
    uncachedInputTokens * prices.input +
      usage.cachedInputTokens * prices.cachedInput +
      usage.cacheWriteTokens * prices.cacheWrite +
      usage.outputTokens * prices.output +
      usage.webSearchCalls * WEB_SEARCH_MICROUSD
  );
}

/** Pre-flight estimate based on the current prediction prompt's typical use. */
export function estimateTypicalPredictionCostMicrousd(model: string): number {
  return estimateOpenAiCostMicrousd(model, TYPICAL_PREDICTION_USAGE);
}

/** Conservative budget claim; actual measured usage is stored after the run. */
export function predictionReservationMicrousd(model: string): number {
  return Math.max(
    50_000,
    Math.ceil(estimateTypicalPredictionCostMicrousd(model) * 1.25)
  );
}
