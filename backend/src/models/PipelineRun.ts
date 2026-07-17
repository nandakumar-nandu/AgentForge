import mongoose, { Schema, Document } from 'mongoose';

export interface IPipelineStepResult {
  stepOrder: number;
  agentId: mongoose.Types.ObjectId;
  input: string;
  output: string;
  tokensUsed: number;
  costUSD: number;
  durationMs: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface IPipelineRun extends Document {
  pipelineId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  initialInput: string;
  stepResults: IPipelineStepResult[];
  overallStatus: 'running' | 'completed' | 'failed' | 'cancelled';
  totalCostUSD: number;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * ============================================================================
 * WHY WE EMBED STEPRESULTS AS AN ARRAY VS A SEPARATE COLLECTION:
 * ============================================================================
 * 
 * 1. Read Performance and Efficiency:
 *    The primary read pattern for a pipeline execution is fetching the *entire*
 *    lifecycle of the run to display the visual progress path in the browser.
 *    Embedding the stepResults array means a single indexed database read fetches
 *    the entire pipeline details without incurring the cost of reference lookups.
 * 
 * 2. Write Atomicity and Durability:
 *    Updates are localized. Adding new step results or modifying a step status can be
 *    persisted in MongoDB via standard atomic array updates (like `$push` or `$set`).
 * 
 * 3. Immutable Snapshot State:
 *    If an agent configuration changes or is deleted in the future, the embedded run
 *    records serve as historical snapshots, retaining the exact instructions and outputs
 *    from when the pipeline ran.
 * ============================================================================
 */
const PipelineStepResultSchema = new Schema<IPipelineStepResult>({
  stepOrder: {
    type: Number,
    required: true
  },
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  input: {
    type: String,
    required: true
  },
  output: {
    type: String,
    default: ''
  },
  tokensUsed: {
    type: Number,
    default: 0
  },
  costUSD: {
    type: Number,
    default: 0
  },
  durationMs: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending'
  }
});

const PipelineRunSchema = new Schema<IPipelineRun>({
  pipelineId: {
    type: Schema.Types.ObjectId,
    ref: 'Pipeline',
    required: [true, 'Pipeline reference ID is required'],
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Pipeline executor User reference ID is required'],
    index: true
  },
  initialInput: {
    type: String,
    required: [true, 'Pipeline initial entry input is required']
  },
  stepResults: {
    type: [PipelineStepResultSchema],
    default: []
  },
  overallStatus: {
    type: String,
    enum: ['running', 'completed', 'failed', 'cancelled'],
    default: 'running',
    index: true
  },
  totalCostUSD: {
    type: Number,
    default: 0
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
});

export default mongoose.model<IPipelineRun>('PipelineRun', PipelineRunSchema);
