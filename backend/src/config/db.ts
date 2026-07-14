import mongoose from 'mongoose';

export async function connectDB(uri: string): Promise<boolean> {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB successfully.');
    return true;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    return false;
  }
}

export function getDBStatus(): 'connected' | 'disconnected' | 'error' {
  const state = mongoose.connection.readyState;
  switch (state) {
    case 1:
      return 'connected';
    case 0:
    case 3:
      return 'disconnected';
    default:
      return 'error';
  }
}
