import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * ============================================================================
 * BULLMQ CORE CONCEPTS EXPLAINED:
 * ============================================================================
 * 
 * 1. Queue:
 *    A Queue is the client-facing interface used to submit new jobs to Redis.
 *    It handles serialization, scheduling, concurrency locks, and job options
 *    (e.g., retries, backoffs, delayed execution). When a job is added to a
 *    Queue, it is persisted as a Redis hash and placed onto a Redis list/set.
 * 
 * 2. Worker:
 *    A Worker is a standalone daemon or background process that listens for
 *    new jobs on a specific queue. It coordinates with Redis (using connection polling
 *    and lua scripts) to safely pop jobs, execute processing logic, and signal
 *    back job completion, progress updates, or errors.
 * 
 * 3. Job:
 *    A Job represents a discrete task configuration. It contains user-defined
 *    payload data (`data`), completion tracking numbers (`progress`), run configuration
 *    options, and status states (waiting, active, completed, failed, delayed).
 * 
 * 4. Events:
 *    BullMQ relies on a pub/sub event mechanism. Listeners can tap into events
 *    emitted by the Queue, Worker, or QueueEvents (like `active`, `progress`,
 *    `completed`, or `failed`) to monitor processing state changes in real-time.
 * ============================================================================
 */

// Establish a dedicated Redis client instance for the BullMQ Queue.
// BullMQ requires setting maxRetriesPerRequest to null for its Redis clients.
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const queueConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

queueConnection.on('error', (err) => {
  console.error('BullMQ Queue Redis connection error:', err);
});

// Define and export the BullMQ Queue.
// Queue name matches 'agent-queue' to align with the background worker.
export const agentQueue = new Queue('agent-queue', {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // wait 5 seconds before retrying failed agent calls
    },
    removeOnComplete: { age: 3600 }, // clean up successful metadata after 1 hour
    removeOnFail: { age: 86400 },    // keep failed job trace records for 24 hours
  },
});

console.log('BullMQ Queue "agent-queue" successfully initialized.');
