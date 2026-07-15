import mongoose, { Schema } from 'mongoose';

/**
 * Interface representing the pure Agent structure in TypeScript.
 * We do not extend mongoose.Document here to avoid name clashes with Mongoose's internal .model() function.
 */
export interface IAgent {
  // The user-facing name of the AI agent (e.g. "Customer support receptionist")
  name: string;
  // The operational category of the agent (receptionist, testimonial collector, qa testing, custom prompts)
  type: 'receptionist' | 'testimonial' | 'qa' | 'custom';
  // The instructions provided to direct the behavior and personality of the agent
  systemPrompt: string;
  // The LLM engine used for executing this agent's workflows
  model: 'gpt-4o' | 'claude-3-5-sonnet';
  // Whether the agent is operational or inactive
  status: 'active' | 'inactive';
  // Database creation timestamp
  createdAt: Date;
}

/**
 * Mongoose Schema definition for the Agent model.
 * Includes validations and comprehensive inline comments.
 */
const AgentSchema = new Schema<IAgent>({
  name: {
    type: String,
    required: [true, 'Agent name is required'],
    trim: true,
    description: 'The descriptive name of the agent'
  },
  type: {
    type: String,
    required: [true, 'Agent type is required'],
    enum: {
      values: ['receptionist', 'testimonial', 'qa', 'custom'],
      message: '{VALUE} is not a valid Agent type. Allowed: receptionist, testimonial, qa, custom'
    },
    description: 'Operational category of the agent: receptionist (greetings/routing), testimonial (reviews/feedback collection), qa (automated testing), custom (bespoke prompts)'
  },
  systemPrompt: {
    type: String,
    required: [true, 'System prompt is required'],
    trim: true,
    description: 'System instructions that guide the LLM behavior'
  },
  model: {
    type: String,
    required: [true, 'Model choice is required'],
    enum: {
      values: ['gpt-4o', 'claude-3-5-sonnet'],
      message: '{VALUE} is not a supported model. Allowed: gpt-4o, claude-3-5-sonnet'
    },
    description: 'LLM engine choice: gpt-4o (OpenAI) or claude-3-5-sonnet (Anthropic)'
  },
  status: {
    type: String,
    required: [true, 'Agent status is required'],
    enum: {
      values: ['active', 'inactive'],
      message: '{VALUE} is not a valid status. Allowed: active, inactive'
    },
    default: 'active',
    description: 'Active status indicator'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    description: 'Creation timestamp of this record'
  }
});

// Create and export the Agent model
export default mongoose.model<IAgent>('Agent', AgentSchema);
