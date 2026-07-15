import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface representing the ChatMessage document structure in MongoDB.
 */
export interface IChatMessage extends Document {
  // Reference to the Agent document associated with this message
  agentId: mongoose.Types.ObjectId;
  // The sender type: either user (human prompt) or agent (AI reply)
  sender: 'user' | 'agent';
  // Plain text textual response or prompt input
  content: string;
  // Timestamp when the message was recorded
  timestamp: Date;
}

/**
 * Mongoose Schema definition for the ChatMessage model.
 */
const ChatMessageSchema = new Schema<IChatMessage>({
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'Agent',
    required: [true, 'Agent reference ID is required'],
    index: true,
    description: 'Reference to the Agent model owner of the conversation thread'
  },
  sender: {
    type: String,
    required: [true, 'Message sender type is required'],
    enum: {
      values: ['user', 'agent'],
      message: '{VALUE} is not a valid sender. Allowed: user, agent'
    },
    description: 'Who sent the message: user (human) or agent (AI)'
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    description: 'The plaintext message body content'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    description: 'Creation timestamp of this message'
  }
});

// Create and export the ChatMessage model
export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
