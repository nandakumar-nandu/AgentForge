import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { initSocket } from './services/socketService';
import { connectDB, getDBStatus } from './config/db';
import { connectRedis, getRedisStatus } from './config/redis';
import { HealthCheckResponse } from '@agentforge/shared';
import agentRouter from './routes/agents';
import chatRouter from './routes/chat';
import jobsRouter from './routes/jobs';
import templatesRouter from './routes/templates';
import analyticsRouter from './routes/analytics';
import pipelinesRouter from './routes/pipelines';
import { authMiddleware } from './middleware/auth';
import authRouter from './routes/auth';
import { generalLimiter } from './middleware/rateLimiter';

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
app.use(generalLimiter);

// Register API Routes
app.use('/api/auth', authRouter);
app.use('/api/agents', authMiddleware, agentRouter);
app.use('/api/agents', authMiddleware, chatRouter);
app.use('/api/jobs', authMiddleware, jobsRouter);
app.use('/api/templates', authMiddleware, templatesRouter);
app.use('/api/analytics', authMiddleware, analyticsRouter);
app.use('/api/pipelines', authMiddleware, pipelinesRouter);

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

// Serve static files from the frontend's export directory
const frontendBuildPath = path.join(__dirname, '../../frontend/out');
app.use(express.static(frontendBuildPath));

// Fallback route: serve index.html for frontend client routing
app.get('*', (req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: `API endpoint ${req.path} not found` });
  }
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// Wrap the Express app in an HTTP Server
const httpServer = createServer(app);

// Attach Socket.io to the HTTP Server
initSocket(httpServer);

// Start the server
httpServer.listen(PORT, () => {
  console.log(`AgentForge Backend server is running on port ${PORT}`);
});
