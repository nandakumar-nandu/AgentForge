import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Interface representing the UsageLog document structure in MongoDB.
 */
export interface IUsageLog {
  agentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  jobId?: mongoose.Types.ObjectId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
  timestamp: Date;
  conversationType: 'chat' | 'batch';
}

/**
 * Interface extending the Mongoose Model to declare static functions.
 */
export interface IUsageLogModel extends Model<IUsageLog> {
  getSummaryByAgent(agentId: string | mongoose.Types.ObjectId): Promise<{
    _id: mongoose.Types.ObjectId;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUSD: number;
    totalRequests: number;
  } | null>;
}

/**
 * ============================================================================
 * WHY COST TRACKING MUST HAPPEN PER-REQUEST, NOT PER-JOB:
 * ============================================================================
 * 
 * 1. Granularity & Precision:
 *    Third-party LLM providers (OpenAI/Anthropic) charge per-request based on the precise
 *    number of input and output tokens consumed in that specific transaction.
 * 
 * 2. Mixed Conversation Lifecycles:
 *    Chat sessions are continuous, interactive streams of messages that do not have
 *    a single parent "job" wrapper. Logging per-request guarantees that both live
 *    chat testing and queued batch automation runs are measured uniformly.
 * 
 * 3. Dynamic Model Tracking:
 *    An agent's configuration (like switching between models) can change mid-way.
 *    Per-request logging ensures each transaction is calculated using the specific
 *    pricing rules matching the active model at that exact timestamp.
 * 
 * 4. Audit Trails & Anomaly Detection:
 *    Saves individual prompts' token profiles so administrators can trace runaway
 *    costs down to specific queries, rather than seeing a bulk sum for a 100-prompt run.
 * ============================================================================
 */
const UsageLogSchema = new Schema<IUsageLog, IUsageLogModel>({
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'Agent',
    required: [true, 'Agent reference ID is required'],
    index: true,
    description: 'Reference to the Agent model associated with the execution call'
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference ID is required'],
    index: true,
    description: 'Reference to the User account billing owner of this request'
  },
  jobId: {
    type: Schema.Types.ObjectId,
    ref: 'AgentJob',
    index: true,
    description: 'Optional reference to the parent automation batch Job'
  },
  model: {
    type: String,
    required: [true, 'Model name identifier is required'],
    description: 'The exact LLM model string target (e.g. gpt-4o)'
  },
  inputTokens: {
    type: Number,
    required: [true, 'inputTokens count is required'],
    min: 0,
    description: 'Number of input/prompt tokens sent to LLM provider'
  },
  outputTokens: {
    type: Number,
    required: [true, 'outputTokens count is required'],
    min: 0,
    description: 'Number of output/completion tokens returned by LLM provider'
  },
  estimatedCostUSD: {
    type: Number,
    required: [true, 'estimatedCostUSD is required'],
    min: 0,
    description: 'Calculated request monetary cost represented in USD'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
    description: 'Time when this usage record was logged'
  },
  conversationType: {
    type: String,
    enum: {
      values: ['chat', 'batch'],
      message: '{VALUE} is not a valid conversation type'
    },
    required: [true, 'conversationType category is required'],
    description: 'Call category: interactive test chat or queued batch run'
  }
});

/**
 * Aggregates total token consumption and costs for a given Agent.
 * Uses the MongoDB aggregation framework pipeline.
 * 
 * Aggregation Stages:
 * 1. $match: Filters usage logs to only parse records matching the target agentId.
 * 2. $group: Collects matching logs and computes sums for input tokens, output tokens,
 *    estimated costs, and logs count totals.
 */
UsageLogSchema.statics.getSummaryByAgent = async function(
  agentId: string | mongoose.Types.ObjectId
) {
  const matchId = typeof agentId === 'string' ? new mongoose.Types.ObjectId(agentId) : agentId;

  const summary = await this.aggregate([
    // STAGE 1: Filter documents to only include those matching the target Agent ID
    {
      $match: {
        agentId: matchId
      }
    },
    // STAGE 2: Group by agentId and sum up key quantitative metrics
    {
      $group: {
        _id: '$agentId',
        totalInputTokens: { $sum: '$inputTokens' },
        totalOutputTokens: { $sum: '$outputTokens' },
        totalCostUSD: { $sum: '$estimatedCostUSD' },
        totalRequests: { $sum: 1 }
      }
    }
  ]);

  return summary.length > 0 ? summary[0] : null;
};

// Export model
export default mongoose.model<IUsageLog, IUsageLogModel>('UsageLog', UsageLogSchema);
