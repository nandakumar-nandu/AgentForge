import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface representing the User document structure in MongoDB.
 */
export interface IUser extends Document {
  username: string;
  password: string; // Hashed password
  
  // Encrypted user-specific third-party API keys
  openaiKeyEncrypted?: string;
  openaiKeyIv?: string; // Initialization vector for OpenAI key
  
  claudeKeyEncrypted?: string;
  claudeKeyIv?: string; // Initialization vector for Claude key
  
  createdAt: Date;
}

/**
 * Mongoose Schema definition for the User model.
 */
const UserSchema = new Schema<IUser>({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    index: true,
    description: 'Unique account identifier for authentication'
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    description: 'Bcrypt-hashed user credential password'
  },
  openaiKeyEncrypted: {
    type: String,
    description: 'AES-256 encrypted OpenAI API key'
  },
  openaiKeyIv: {
    type: String,
    description: 'IV parameter used for AES-256 OpenAI key decryption'
  },
  claudeKeyEncrypted: {
    type: String,
    description: 'AES-256 encrypted Claude API key'
  },
  claudeKeyIv: {
    type: String,
    description: 'IV parameter used for AES-256 Claude key decryption'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    description: 'Time when the user profile was registered'
  }
});

// Export model
export default mongoose.model<IUser>('User', UserSchema);
