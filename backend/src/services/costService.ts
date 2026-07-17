import mongoose from 'mongoose';
import UsageLog from '../models/UsageLog';

/**
 * ============================================================================
 * WHY PRICING CONSTANTS BELONG IN A SERVICE AND NOT HARDCODED IN LLM SERVICE:
 * ============================================================================
 * 
 * 1. Single Source of Truth:
 *    LLM model pricing is highly volatile. Providers frequently adjust token rates
 *    or release discounted sub-models. Centralizing cost parameters in a dedicated
 *    service prevents changes from leaking into the core prompt-routing code.
 * 
 * 2. Separation of Concerns:
 *    The `llmService` handles network communication and response resolution.
 *    The `costService` handles pricing audits and usage telemetry.
 *    Keeping them decoupled ensures changes to the billing configuration do not
 *    introduce bugs in the completion engines.
 * 
 * 3. Testing and Extensibility:
 *    Isolating cost calculation logic enables testing pricing matrices, bulk
 *    discounts, and credit tracking off-line without making live network requests.
 * ============================================================================
 */

// Model pricing constants per 1,000,000 tokens (USD)
export const MODEL_PRICING: Record<string, { inputRate: number; outputRate: number }> = {
  'gpt-4o': {
    inputRate: 5.00,  // $5.00 per 1M input tokens
    outputRate: 15.00 // $15.00 per 1M output tokens
  },
  'claude-3-5-sonnet': {
    inputRate: 3.00,  // $3.00 per 1M input tokens
    outputRate: 15.00 // $15.00 per 1M output tokens
  }
};

/**
 * Computes the estimated monetary cost in USD for a given LLM model invocation.
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Normalize model identifier mapping
  let configKey = 'gpt-4o';
  if (model.includes('claude') || model.includes('sonnet')) {
    configKey = 'claude-3-5-sonnet';
  } else if (model.includes('gpt-4o')) {
    configKey = 'gpt-4o';
  }

  const rates = MODEL_PRICING[configKey];
  if (!rates) {
    // Default fallback to gpt-4o pricing if unrecognized
    const fallback = MODEL_PRICING['gpt-4o'];
    return ((inputTokens * fallback.inputRate) + (outputTokens * fallback.outputRate)) / 1_000_000;
  }

  const inputCost = (inputTokens * rates.inputRate) / 1_000_000;
  const outputCost = (outputTokens * rates.outputRate) / 1_000_000;

  // Round cost calculations to 6 decimal places for high precision
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

interface LogUsageParams {
  agentId: string | mongoose.Types.ObjectId;
  userId: string | mongoose.Types.ObjectId;
  jobId?: string | mongoose.Types.ObjectId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  conversationType: 'chat' | 'batch';
}

/**
 * Persists token statistics and calculates costs into MongoDB UsageLogs.
 */
export async function logUsage(params: LogUsageParams) {
  try {
    const estimatedCostUSD = calculateCost(params.model, params.inputTokens, params.outputTokens);

    const log = new UsageLog({
      agentId: new mongoose.Types.ObjectId(params.agentId),
      userId: new mongoose.Types.ObjectId(params.userId),
      jobId: params.jobId ? new mongoose.Types.ObjectId(params.jobId) : undefined,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCostUSD,
      conversationType: params.conversationType
    });

    const saved = await log.save();
    console.info(`[costService] Usage log recorded. Cost: $${estimatedCostUSD.toFixed(6)} USD`);
    return saved;
  } catch (err: any) {
    console.error('[costService] Failed to persist usage record:', err.message);
    return null;
  }
}
