import { Router, Request, Response } from 'express';
import AgentJob from '../models/AgentJob';
import { agentQueue } from '../queues/agentQueue';
import { getIO } from '../services/socketService';

const router = Router();

/**
 * GET /api/jobs
 * Retrieves all batch jobs from MongoDB, sorted by creation timestamp descending.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const jobs = await AgentJob.find().sort({ createdAt: -1 }).populate('agentId', 'name model');
    res.status(200).json(jobs);
  } catch (error: any) {
    console.error('Error fetching jobs list:', error);
    res.status(500).json({ message: 'Server error retrieving jobs list', error: error.message });
  }
});

/**
 * GET /api/jobs/:id
 * Retrieves status, results, progress, and metadata of a single batch job.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await AgentJob.findById(id).populate('agentId', 'name model');
    if (!job) {
      return res.status(404).json({ message: `Job with ID ${id} not found` });
    }
    res.status(200).json(job);
  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid Job ID format' });
    }
    console.error('Error fetching job details:', error);
    res.status(500).json({ message: 'Server error retrieving job information', error: error.message });
  }
});

/**
 * POST /api/jobs/:id/pause
 * Pauses an active or pending batch job by changing its status to 'paused'.
 * The background worker checks this status at each batch item iteration.
 */
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await AgentJob.findById(id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (job.status !== 'active' && job.status !== 'pending') {
      return res.status(400).json({ message: `Cannot pause a job in status '${job.status}'` });
    }

    job.status = 'paused';
    await job.save();

    // Broadcast pause events via socket
    try {
      const io = getIO();
      io.to(`job:${id}`).emit('job:paused', { jobId: id });
      io.emit('job:paused', { jobId: id });
    } catch (sockErr) {
      console.warn('Failed to emit socket pause event:', sockErr);
    }

    console.info(`[Router] Job ${id} has been paused.`);
    res.status(200).json({ message: 'Job paused successfully', job });
  } catch (error: any) {
    console.error('Error pausing job:', error);
    res.status(500).json({ message: 'Server error pausing job', error: error.message });
  }
});

/**
 * POST /api/jobs/:id/resume
 * Resumes a paused batch job by changing its status back to 'active'.
 * The sleeping background worker will resume execution.
 */
router.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await AgentJob.findById(id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (job.status !== 'paused') {
      return res.status(400).json({ message: 'Job is not currently paused' });
    }

    job.status = 'active';
    await job.save();

    // Broadcast resume events via socket
    try {
      const io = getIO();
      io.to(`job:${id}`).emit('job:resumed', { jobId: id });
      io.emit('job:resumed', { jobId: id });
    } catch (sockErr) {
      console.warn('Failed to emit socket resume event:', sockErr);
    }

    console.info(`[Router] Job ${id} has been resumed.`);
    res.status(200).json({ message: 'Job resumed successfully', job });
  } catch (error: any) {
    console.error('Error resuming job:', error);
    res.status(500).json({ message: 'Server error resuming job', error: error.message });
  }
});

/**
 * POST /api/jobs/:id/cancel
 * Aborts a pending or active batch job. If pending, removes it from the BullMQ Redis queue.
 * Marks the status as failed with a "Cancelled by user" error description.
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await AgentJob.findById(id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return res.status(400).json({ message: `Cannot cancel a finished job in status '${job.status}'` });
    }

    // Attempt to remove job from BullMQ if it is waiting in Redis
    try {
      const bullJob = await agentQueue.getJob(id);
      if (bullJob) {
        await bullJob.remove();
        console.log(`[Router] Removed Job ${id} from BullMQ queue.`);
      }
    } catch (bullErr) {
      console.warn(`[Router] Warning: Could not remove job ${id} from BullMQ queue:`, bullErr);
    }

    // Force update status in database
    job.status = 'failed';
    job.error = 'Cancelled by user';
    job.completedAt = new Date();
    await job.save();

    // Broadcast cancellation (as failure) events via socket
    try {
      const io = getIO();
      io.to(`job:${id}`).emit('job:failed', { jobId: id, error: 'Cancelled by user' });
      io.emit('job:failed', { jobId: id, error: 'Cancelled by user' });
    } catch (sockErr) {
      console.warn('Failed to emit socket cancellation event:', sockErr);
    }

    console.info(`[Router] Job ${id} has been cancelled.`);
    res.status(200).json({ message: 'Job cancelled successfully', job });
  } catch (error: any) {
    console.error('Error cancelling job:', error);
    res.status(500).json({ message: 'Server error cancelling job', error: error.message });
  }
});

/**
 * POST /api/jobs/:id/retry
 * Retries a failed or cancelled batch job by resetting its properties,
 * enqueuing a fresh BullMQ task with the same inputs, and transitioning status to 'pending'.
 */
router.post('/:id/retry', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await AgentJob.findById(id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (job.status !== 'failed') {
      return res.status(400).json({ message: 'Only failed or cancelled jobs can be retried' });
    }

    // Reset status fields
    job.status = 'pending';
    job.progress = 0;
    job.results = [];
    job.error = undefined;
    job.completedAt = undefined;
    await job.save();

    // Enqueue a fresh task to BullMQ (setting custom jobId matching MongoDB objectId)
    const bullJob = await agentQueue.add(
      'batch-job',
      {
        jobId: job._id.toString(),
        agentId: job.agentId.toString(),
        inputData: job.inputData
      },
      { jobId: job._id.toString() }
    );

    console.info(`[Router] Retried Job ${id}. Enqueued new BullMQ task: ${bullJob.id}`);
    res.status(200).json({ message: 'Job retried and enqueued successfully', job });
  } catch (error: any) {
    console.error('Error retrying job:', error);
    res.status(500).json({ message: 'Server error triggering job retry', error: error.message });
  }
});

export default router;
