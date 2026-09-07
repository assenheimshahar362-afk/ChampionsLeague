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

const PRICE_MICROUSD_PER_TOKEN: Record<string, TokenPrices> = {
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