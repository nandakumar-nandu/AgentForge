import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Pipeline from '../models/Pipeline';
import PipelineRun from '../models/PipelineRun';
import { runPipeline } from '../services/pipelineRunner';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/**
 * GET /api/pipelines
 * Lists all active pipelines for the authenticated user.
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId || '60f79b001efab00123456789'; // Sandbox local fallback
    
    // Fetch pipelines sorted by update timestamp
    const pipelines = await Pipeline.find({ 
      userId: new mongoose.Types.ObjectId(userId), 
      status: { $ne: 'archived' } 
    }).sort({ updatedAt: -1 });

    res.status(200).json(pipelines);
  } catch (error: any) {
    console.error('[routes/pipelines] List query failed:', error);
    res.status(500).json({ message: 'Server error listing pipelines', error: error.message });
  }
});

/**
 * POST /api/pipelines
 * Creates a new multi-agent pipeline setup.
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId || '60f79b001efab00123456789';
    const { name, description, steps } = req.body;

    if (!name || !steps || steps.length === 0) {
      return res.status(400).json({ message: 'Pipeline name and at least one step configuration are required' });
    }

    const pipeline = new Pipeline({
      name,
      description,
      userId: new mongoose.Types.ObjectId(userId),
      steps,
      status: 'active'
    });

    const saved = await pipeline.save();
    res.status(201).json(saved);
  } catch (error: any) {
    console.error('[routes/pipelines] Creation failed:', error);
    res.status(500).json({ message: 'Server error creating pipeline', error: error.message });
  }
});

/**
 * GET /api/pipelines/:id
 * Fetches detail parameters of a specific pipeline by ID.
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pipeline = await Pipeline.findById(id).populate('steps.agentId', 'name type model');

    if (!pipeline) {
      return res.status(404).json({ message: `Pipeline with ID ${id} not found` });
    }

    res.status(200).json(pipeline);
  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid pipeline ID format' });
    }
    console.error('[routes/pipelines] Query details failed:', error);
    res.status(500).json({ message: 'Server error querying pipeline details', error: error.message });
  }
});

/**
 * PUT /api/pipelines/:id
 * Updates name, descriptions, or sorting steps of a pipeline.
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, steps, status } = req.body;

    const pipeline = await Pipeline.findById(id);
    if (!pipeline) {
      return res.status(404).json({ message: `Pipeline with ID ${id} not found` });
    }

    if (name !== undefined) pipeline.name = name;
    if (description !== undefined) pipeline.description = description;
    if (steps !== undefined) pipeline.steps = steps;
    if (status !== undefined) pipeline.status = status;

    const updated = await pipeline.save();
    res.status(200).json(updated);
  } catch (error: any) {
    console.error('[routes/pipelines] Update failed:', error);
    res.status(500).json({ message: 'Server error updating pipeline', error: error.message });
  }
});

/**
 * DELETE /api/pipelines/:id
 * Soft deletes/archives a pipeline.
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pipeline = await Pipeline.findById(id);

    if (!pipeline) {
      return res.status(404).json({ message: `Pipeline with ID ${id} not found` });
    }

    // Set status to archived to hide from directory indices
    pipeline.status = 'archived';
    await pipeline.save();

    res.status(200).json({ message: 'Pipeline archived successfully', id });
  } catch (error: any) {
    console.error('[routes/pipelines] Archive failed:', error);
    res.status(500).json({ message: 'Server error archiving pipeline', error: error.message });
  }
});

/**
 * POST /api/pipelines/:id/run
 * Executes a pipeline run, passing output contexts sequentially.
 * Returns the pipelineRunId immediately (asynchronous loop execution).
 */
router.post('/:id/run', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { initialInput } = req.body;
    const userId = (req as AuthenticatedRequest).user?.userId || '60f79b001efab00123456789';

    if (!initialInput || initialInput.trim() === '') {
      return res.status(400).json({ message: 'initialInput parameters string is required' });
    }

    const runId = await runPipeline(id, initialInput, userId);
    res.status(202).json({ message: 'Pipeline execution initiated', pipelineRunId: runId });
  } catch (error: any) {
    console.error('[routes/pipelines] Run trigger failed:', error);
    res.status(500).json({ message: 'Server error initiating execution run', error: error.message });
  }
});

/**
 * GET /api/pipelines/:id/runs
 * Lists all execution runs associated with a pipeline.
 */
router.get('/:id/runs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const runs = await PipelineRun.find({ pipelineId: new mongoose.Types.ObjectId(id) })
      .sort({ startedAt: -1 });

    res.status(200).json(runs);
  } catch (error: any) {
    console.error('[routes/pipelines] Run history query failed:', error);
    res.status(500).json({ message: 'Server error fetching runs list', error: error.message });
  }
});

/**
 * GET /api/pipelines/runs/:runId
 * Retrieves detailed step results and cost figures for an individual execution run.
 */
router.get('/runs/:runId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const run = await PipelineRun.findById(runId).populate('stepResults.agentId', 'name type model');

    if (!run) {
      return res.status(404).json({ message: `Execution run with ID ${runId} not found` });
    }

    res.status(200).json(run);
  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid run ID format' });
    }
    console.error('[routes/pipelines] Run details query failed:', error);
    res.status(500).json({ message: 'Server error fetching run details', error: error.message });
  }
});

export default router;
