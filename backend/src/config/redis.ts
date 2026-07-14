import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function connectRedis(url: string): Redis {
  if (redisClient) return redisClient;

  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redisClient.on('connect', () => {
    console.log('Connected to Redis successfully.');
  });

  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  // Explicitly trigger connection attempt
  redisClient.connect().catch((err) => {
    console.error('Redis initial connection failed:', err.message);
  });

  return redisClient;
}

export function getRedisClient(): Redis | null {
  return redisClient;
}

export async function getRedisStatus(): Promise<'connected' | 'disconnected' | 'error'> {
  if (!redisClient) return 'disconnected';
  try {
    if (redisClient.status === 'ready' || redisClient.status === 'connect') {
      const ping = await redisClient.ping();
      return ping === 'PONG' ? 'connected' : 'error';
    }
    return 'disconnected';
  } catch (error) {
    return 'error';
  }
}
