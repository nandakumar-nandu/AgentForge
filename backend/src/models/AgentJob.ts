import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface representing the AgentJob document structure in MongoDB.
 */
export interface IAgentJob extends Document {
  // Reference to the Agent document executing this job
  agentId: mongoose.Types.ObjectId;
  // Array of string queries to process in batch
  inputData: string[];
  // Current job queue lifecycle status
  status: 'pending' | 'active' | 'completed' | 'failed' | 'paused';
  // Array of LLM outputs corresponding to the inputData queries
  results: string[];
  // Completion progress percentage (0 - 100)
  progress: number;
  // Error message if the batch processing encountered an exception
  error?: string;
  // Optional URL to trigger completion callback notification POSTs
  webhookUrl?: string;
  // Creation timestamp of the job
  createdAt: Date;
  // Time when job processing finished
  completedAt?: Date;
}

/**
 * Mongoose Schema definition for the AgentJob model.
 */
const AgentJobSchema = new Schema<IAgentJob>({
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'Agent',
    required: [true, 'Agent reference ID is required'],
    index: true,
    description: 'Reference to the Agent model running this batch job'
  },
  inputData: {
    type: [String],
    required: [true, 'inputData array is required'],
    validate: {
      validator: (arr: string[]) => arr && arr.length > 0,
      message: 'inputData must contain at least one query string'
    },
    description: 'List of queries to be run in batch'
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'active', 'completed', 'failed', 'paused'],
      message: '{VALUE} is not a valid status'
    },
    default: 'pending',
    description: 'Job queue status: pending, active, completed, failed, or paused'
  },
  results: {
    type: [String],
    default: [],
    description: 'Sequential LLM answers matching inputData queries'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
    description: 'Incremental processing completion percentage'
  },
  error: {
    type: String,
    trim: true,
    description: 'Optional error description if execution fails'
  },
  webhookUrl: {
    type: String,
    trim: true,
    description: 'Optional callback URL to notify with results upon completion'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    description: 'Time when this batch job log was spawned'
  },
  completedAt: {
    type: Date,
    description: 'Time when the queue worker completed processing the job'
  }
});

// Export model
export default mongoose.model<IAgentJob>('AgentJob', AgentJobSchema);
