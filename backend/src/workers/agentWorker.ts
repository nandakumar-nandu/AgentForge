import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import AgentJob from '../models/AgentJob';
import { chat } from '../services/llmService';

/**
 * ============================================================================
 * WORKER LIFECYCLE EXPLAINED:
 * ============================================================================
 * 
 * 1. Startup & Registration:
 *    When the worker class is instantiated, it establishes a persistent blocking
 *    connection to Redis. It announces its presence and starts listening for jobs
 *    published to the 'agent-queue' namespace.
 * 
 * 2. Job Polling & Lock Acquisition:
 *    The worker polls Redis for 'waiting' tasks. When a job is found, the worker
 *    acquires an exclusive Redis lock on the Job ID to ensure no other cluster node
 *    tries to process the same task. The lock is refreshed periodically.
 * 
 * 3. Execution (The Processor):
 *    The worker invokes the provided async processor function, passing the Job instance
 *    with its payload (`job.data`). During execution, progress values are calculated
 *    and reported back to Redis and the database.
 * 
 * 4. Completion / Failure Resolution:
 *    - Success: If the handler returns successfully, the job moves to the 'completed' state.
 *      The worker releases the Redis lock and triggers completion events.
 *    - Failure: If an exception is thrown, the worker intercepts it, updates the job
 *      state in Redis to 'failed', records the error trace, and initiates auto-retries
 *      if attempts are remaining.
 * ============================================================================
 */

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Setup worker Redis connection (requires maxRetriesPerRequest: null)
const workerConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

workerConnection.on('error', (err) => {
  console.error('BullMQ Worker Redis connection error:', err);
});

// Define and initialize the Worker
export const agentWorker = new Worker(
  'agent-queue',
  async (job: Job) => {
    const { jobId, agentId, inputData } = job.data;
    
    console.info(`[Worker] Started processing Job ${job.id} (Agent: ${agentId})`);

    // 1. Fetch the AgentJob log tracking document from MongoDB
    const agentJob = await AgentJob.findById(jobId);
    if (!agentJob) {
      throw new Error(`Mongoose AgentJob tracking document with ID ${jobId} not found`);
    }

    // 2. Set job state to active in MongoDB
    agentJob.status = 'active';
    agentJob.progress = 0;
    await agentJob.save();

    const results: string[] = [];
    const totalCount = inputData.length;

    // 3. Process each query in the batch sequentially
    for (let index = 0; index < totalCount; index++) {
      const queryPrompt = inputData[index];
      
      console.info(`[Worker] Running batch item ${index + 1}/${totalCount} for Job ${job.id}`);
      
      try {
        // Direct integration with our LLM Completion service Router.
        // We pass empty history ([]) for individual isolated batch prompts.
        const responseText = await chat(agentId, queryPrompt, []);
        results.push(responseText);
      } catch (err: any) {
        console.error(`[Worker] Failed prompt processing on item ${index + 1}:`, err);
        results.push(`Error executing query: ${err.message || 'Unknown LLM issue'}`);
      }

      // Calculate progress percentage
      const currentProgress = Math.round(((index + 1) / totalCount) * 100);

      // Save intermediate results and progress to Mongoose DB
      agentJob.results = results;
      agentJob.progress = currentProgress;
      await agentJob.save();

      // Emit progress to BullMQ Redis watchers
      await job.updateProgress(currentProgress);
    }

    // 4. Mark job as completed successfully
    agentJob.status = 'completed';
    agentJob.completedAt = new Date();
    await agentJob.save();

    console.info(`[Worker] Completed processing Job ${job.id} (Agent: ${agentId})`);
    return { count: totalCount, success: true };
  },
  {
    connection: workerConnection,
    concurrency: 2 // Allow concurrent processing of 2 jobs globally
  }
);

// Worker Lifecycle Events
agentWorker.on('completed', (job) => {
  console.log(`[Worker Event] Job ${job.id} completed successfully.`);
});

agentWorker.on('failed', async (job, err) => {
  console.error(`[Worker Event] Job ${job?.id} failed with error:`, err);
  
  if (job) {
    const { jobId } = job.data;
    try {
      await AgentJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        error: err.message || 'Worker execution error',
        completedAt: new Date()
      });
      console.info(`[Worker Event] Updated AgentJob ${jobId} status to failed in database.`);
    } catch (dbErr) {
      console.error('[Worker Event] Failed to update AgentJob error status in database:', dbErr);
    }
  }
});

console.log('BullMQ Worker "agentWorker" successfully registered and polling.');
