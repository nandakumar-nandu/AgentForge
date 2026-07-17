import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB, getDBStatus } from './config/db';
import { connectRedis, getRedisStatus } from './config/redis';
import { HealthCheckResponse } from '@agentforge/shared';
import agentRouter from './routes/agents';
import chatRouter from './routes/chat';
import jobsRouter from './routes/jobs';

// Initialize background queue processing worker
import './workers/agentWorker';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/agentforge';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Configure middleware
app.use(cors());
app.use(express.json());

// Register API Routes
app.use('/api/agents', agentRouter);
app.use('/api/agents', chatRouter);
app.use('/api/jobs', jobsRouter);

// Initialize external connections
connectDB(MONGODB_URI);
connectRedis(REDIS_URL);

// GET /health - Check services health status
app.get('/health', async (req: Request, res: Response) => {
  const dbStatus = getDBStatus();
  const redisStatus = await getRedisStatus();

  const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';

  const healthResponse: HealthCheckResponse = {
    status: isHealthy ? 'ok' : 'error',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: {
        status: dbStatus,
        message: dbStatus === 'connected' ? 'MongoDB is connected.' : 'MongoDB is disconnected.',
      },
      redis: {
        status: redisStatus,
        message: redisStatus === 'connected' ? 'Redis is connected.' : 'Redis is disconnected.',
      },
    },
  };

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(healthResponse);
});

// Root path fallback
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to the AgentForge API. Use GET /health for status.' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`AgentForge Backend server is running on port ${PORT}`);
});
