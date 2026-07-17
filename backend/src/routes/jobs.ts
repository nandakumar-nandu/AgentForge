import { Router, Request, Response } from 'express';
import AgentJob from '../models/AgentJob';

const router = Router();

/**
 * GET /api/jobs/:id
 * Retrieves status, results, progress, and metadata of a batch job from MongoDB.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch the Mongoose tracking document
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

export default router;
