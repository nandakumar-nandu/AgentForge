import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import AgentJob from '../models/AgentJob';
import { chat } from '../services/llmService';
import { getIO } from '../services/socketService';

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
    const { jobId, agentId, inputData, userId } = job.data;
    
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
      // Fetch latest job state from DB to check for pause/cancellation mid-flight
      let currentJob = await AgentJob.findById(jobId);
      if (!currentJob) {
        throw new Error(`AgentJob ${jobId} tracking document was deleted from database`);
      }

      // Check for user-driven cancellation
      if (currentJob.status === 'failed' && currentJob.error === 'Cancelled by user') {
        throw new Error('Cancelled by user');
      }

      // Sleep loop for paused state
      while (currentJob.status === 'paused') {
        console.info(`[Worker] Job ${job.id} is paused. Sleeping for 2 seconds...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        currentJob = await AgentJob.findById(jobId);
        if (!currentJob) {
          throw new Error(`AgentJob ${jobId} tracking document was deleted from database during pause`);
        }
        if (currentJob.status === 'failed' && currentJob.error === 'Cancelled by user') {
          throw new Error('Cancelled by user');
        }
      }

      const queryPrompt = inputData[index];
      console.info(`[Worker] Running batch item ${index + 1}/${totalCount} for Job ${job.id}`);
      
      try {
        // Direct integration with our LLM Completion service Router.
        const responseText = await chat(agentId, queryPrompt, [], userId);
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

      // Emit Socket.io updates to room listeners and dashboard
      try {
        const io = getIO();
        io.to(`job:${jobId}`).emit('job:progress', { jobId, progress: currentProgress, results });
        io.emit('job:progress', { jobId, progress: currentProgress, results });
      } catch (sockErr) {
        console.warn('[Worker] Failed to emit Socket.io progress update:', sockErr);
      }
    }

    // 4. Mark job as completed successfully
    agentJob.status = 'completed';
    agentJob.completedAt = new Date();
    await agentJob.save();

    // Trigger webhook callback notification if configured
    if (agentJob.webhookUrl && agentJob.webhookUrl.trim() !== "") {
      console.info(`[Worker] Dispatching completion webhook to: ${agentJob.webhookUrl}`);
      try {
        const response = await fetch(agentJob.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'AgentForge-Webhook-Service/1.0'
          },
          body: JSON.stringify({
            jobId: agentJob._id.toString(),
            agentId: agentJob.agentId.toString(),
            status: 'completed',
            results: agentJob.results,
            progress: 100,
            completedAt: agentJob.completedAt.toISOString()
          })
        });
        
        console.info(`[Worker] Webhook dispatched. HTTP status returned: ${response.status}`);
      } catch (webhookErr: any) {
        console.error(`[Worker] Webhook dispatch execution failed:`, webhookErr.message);
        
        /**
         * ============================================================================
         * WEBHOOK RETRY STRATEGY & ROBUST DESIGN FOR PRODUCTION:
         * ============================================================================
         * 
         * In a high-traffic production system, webhooks must be resilient to receiver
         * offline issues, network dropouts, and server timeouts.
         * 
         * 1. Queue Separation:
         *    Avoid trying to perform retries directly inside the core BullMQ Agent Worker.
         *    If a webhook POST fails (or returns a non-2xx status), create a new job task and
         *    enqueue it onto a dedicated 'webhook-delivery-queue'.
         * 
         * 2. Exponential Backoff Retries:
         *    Configure the delivery queue with backoff settings (e.g. 5 attempts, exponential):
         *    - Attempt 1: Wait 1 minute
         *    - Attempt 2: Wait 5 minutes
         *    - Attempt 3: Wait 30 minutes
         *    - Attempt 4: Wait 2 hours
         *    - Attempt 5: Wait 12 hours
         * 
         * 3. Circuit Breaker Pattern:
         *    If a target webhookUrl consistently returns 502/503 errors over a sustained period,
         *    temporarily trip a circuit breaker to disable sending requests to that domain
         *    for an hour to prevent system resource starvation.
         * 
         * 4. Security Signatures:
         *    Compute a HMAC SHA256 signature hash of the JSON body using a shared secret keys
         *    passphrase and inject it in a header (e.g. 'x-agentforge-signature'). This allows
         *    receivers to authenticate that the payload originated from our platform.
         * ============================================================================
         */
      }
    }

    // Emit Socket.io completion updates
    try {
      const io = getIO();
      io.to(`job:${jobId}`).emit('job:completed', { jobId, results });
      io.emit('job:completed', { jobId, results });
    } catch (sockErr) {
      console.warn('[Worker] Failed to emit Socket.io completed update:', sockErr);
    }

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
      const updated = await AgentJob.findByIdAndUpdate(
        jobId,
        {
          status: 'failed',
          error: err.message || 'Worker execution error',
          completedAt: new Date()
        },
        { new: true }
      );
      
      // Emit Socket.io failure updates
      try {
        const io = getIO();
        io.to(`job:${jobId}`).emit('job:failed', { jobId, error: err.message || 'Worker execution error' });
        io.emit('job:failed', { jobId, error: err.message || 'Worker execution error' });
      } catch (sockErr) {
        console.warn('[Worker Event] Failed to emit Socket.io failed update:', sockErr);
      }
      
      console.info(`[Worker Event] Updated AgentJob ${jobId} status to failed in database.`);
    } catch (dbErr) {
      console.error('[Worker Event] Failed to update AgentJob error status in database:', dbErr);
    }
  }
});

console.log('BullMQ Worker "agentWorker" successfully registered and polling.');
