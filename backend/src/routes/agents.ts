import { Router, Response, Request } from 'express';
import mongoose from 'mongoose';
import Agent from '../models/Agent';
import AgentJob from '../models/AgentJob';
import { agentQueue } from '../queues/agentQueue';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { jobLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * GET /api/agents
 * Retrieve all agents stored in the database.
 * Protected by JWT Auth.
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const agents = await Agent.find().sort({ createdAt: -1 });
    res.status(200).json(agents);
  } catch (error: any) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Server error retrieving agents', error: error.message });
  }
});

/**
 * POST /api/agents
 * Create a new agent document.
 * Protected by JWT Auth.
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, type, systemPrompt, model, status } = req.body;

    const newAgent = new Agent({
      name,
      type,
      systemPrompt,
      model,
      status: status || 'active'
    });

    const savedAgent = await newAgent.save();
    res.status(201).json(savedAgent);
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val: any) => val.message);
      return res.status(400).json({ message: 'Validation failed', errors: messages });
    }
    console.error('Error creating agent:', error);
    res.status(500).json({ message: 'Server error creating agent', error: error.message });
  }
});

/**
 * GET /api/agents/:id
 * Retrieve details of a single agent.
 * Protected by JWT Auth.
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agent = await Agent.findById(id);

    if (!agent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    res.status(200).json(agent);
  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }
    console.error('Error fetching agent details:', error);
    res.status(500).json({ message: 'Server error retrieving agent details', error: error.message });
  }
});

/**
 * PUT /api/agents/:id
 * Update properties of an existing agent.
 * Protected by JWT Auth.
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, systemPrompt, model, status } = req.body;

    const updatedAgent = await Agent.findByIdAndUpdate(
      id,
      { name, type, systemPrompt, model, status },
      { new: true, runValidators: true }
    );

    if (!updatedAgent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    res.status(200).json(updatedAgent);
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val: any) => val.message);
      return res.status(400).json({ message: 'Validation failed', errors: messages });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }
    console.error('Error updating agent:', error);
    res.status(500).json({ message: 'Server error updating agent', error: error.message });
  }
});

/**
 * DELETE /api/agents/:id
 * Permanently remove an agent from the system database.
 * Protected by JWT Auth.
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deletedAgent = await Agent.findByIdAndDelete(id);

    if (!deletedAgent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    res.status(200).json({ message: `Agent '${deletedAgent.name}' successfully deleted` });
  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }
    console.error('Error deleting agent:', error);
    res.status(500).json({ message: 'Server error deleting agent', error: error.message });
  }
});

/**
 * POST /api/agents/:id/run
 * Schedules a batch run job. Protected by JWT Auth.
 */
router.post('/:id/run', authMiddleware, jobLimiter, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;
    const { inputData, webhookUrl } = req.body;
    const userId = authReq.user?.userId;

    // Validate inputData parameter is a non-empty array
    if (!inputData || !Array.isArray(inputData) || inputData.length === 0) {
      return res.status(400).json({ message: "Request body parameter 'inputData' must be a non-empty array of strings" });
    }

    // Validate that all array items are non-empty strings
    const allValidStrings = inputData.every(item => typeof item === 'string' && item.trim() !== "");
    if (!allValidStrings) {
      return res.status(400).json({ message: "All entries in 'inputData' must be non-empty strings" });
    }

    // Check if the agent exists
    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    // Create a new AgentJob log in MongoDB
    const agentJob = new AgentJob({
      agentId: id,
      inputData: inputData.map(str => str.trim()),
      webhookUrl: webhookUrl ? String(webhookUrl).trim() : undefined,
      userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
      status: 'pending',
      results: [],
      progress: 0
    });
    await agentJob.save();

    // Enqueue the batch job task to the BullMQ Redis queue
    const bullJob = await agentQueue.add(
      'batch-job',
      {
        jobId: agentJob._id.toString(),
        agentId: id,
        inputData: agentJob.inputData,
        userId: userId // Pass userId context to worker payload
      },
      { jobId: agentJob._id.toString() }
    );

    console.info(`[Router] Enqueued job ${bullJob.id} for AgentJob ${agentJob._id}`);

    res.status(202).json({
      message: 'Batch processing job enqueued successfully',
      jobId: agentJob._id.toString()
    });

  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }
    console.error('Error running batch agent job:', error);
    res.status(500).json({ message: 'Server error triggering batch execution', error: error.message });
  }
});

export default router;
