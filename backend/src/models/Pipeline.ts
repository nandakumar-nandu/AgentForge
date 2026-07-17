import mongoose, { Schema, Document } from 'mongoose';

export interface IPipelineStep {
  order: number;
  agentId: mongoose.Types.ObjectId;
  inputSource: 'user_input' | 'previous_step_output';
  outputKey: string;
  transformPrompt?: string;
}

export interface IPipeline extends Document {
  name: string;
  description?: string;
  userId: mongoose.Types.ObjectId;
  steps: IPipelineStep[];
  status: 'draft' | 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ============================================================================
 * AGENT CHAINING AND PIPELINE EXECUTION MODEL:
 * ============================================================================
 * 
 * 1. Chaining Context Mechanism:
 *    When a pipeline runs, the system initializes a key-value context dictionary:
 *    `context = { "user_input": initialInput }`
 *    
 *    For each step N, the runner checks its `inputSource`:
 *    - If `user_input`, it passes `initialInput` as the prompt.
 *    - If `previous_step_output`, it resolves the prompt by fetching the saved
 *      output text linked to the configured step key (accumulated in context).
 * 
 *    After step N successfully executes, the generated text is stored inside the
 *    context dictionary under the defined `outputKey` string:
 *    `context[step.outputKey] = stepOutputResponseText`
 *    
 *    This output key now becomes dynamically available as input context or reference
 *    for step N+1.
 * 
 * 2. Why transformPrompt is Optional:
 *    By default, the raw output of Agent N is forwarded directly to Agent N+1.
 *    However, if `transformPrompt` is defined, the system runs an intermediate
 *    LLM formatting call. This prompts the engine to reshape or clean the output
 *    (e.g., extracting JSON properties, converting summaries to tables, etc.)
 *    before presenting it to the next agent.
 * ============================================================================
 */
const PipelineStepSchema = new Schema<IPipelineStep>({
  order: {
    type: Number,
    required: [true, 'Step execution order index is required'],
    min: 1
  },
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'Agent',
    required: [true, 'Target step Agent configuration ID is required']
  },
  inputSource: {
    type: String,
    enum: {
      values: ['user_input', 'previous_step_output'],
      message: '{VALUE} is not a valid input source selection'
    },
    required: [true, 'Step input source is required']
  },
  outputKey: {
    type: String,
    required: [true, 'Step output context save key is required'],
    trim: true,
    validate: {
      validator: (v: string) => /^[a-zA-Z0-9_]+$/.test(v),
      message: 'Output key must contain only letters, numbers, or underscores'
    }
  },
  transformPrompt: {
    type: String,
    description: 'Optional transformation instruction prompt to shape output data structure'
  }
});

const PipelineSchema = new Schema<IPipeline>({
  name: {
    type: String,
    required: [true, 'Pipeline name identifier is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Pipeline owner User reference ID is required'],
    index: true
  },
  steps: {
    type: [PipelineStepSchema],
    required: [true, 'Pipeline execution steps array is required'],
    validate: {
      validator: (v: IPipelineStep[]) => v && v.length > 0,
      message: 'A pipeline must contain at least one step'
    }
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'active',
    index: true
  }
}, {
  timestamps: true
});

// Enforce ascending steps ordering check before saving
PipelineSchema.pre('save', function(next) {
  if (this.steps && this.steps.length > 0) {
    this.steps.sort((a, b) => a.order - b.order);
  }
  next();
});

export default mongoose.model<IPipeline>('Pipeline', PipelineSchema);
