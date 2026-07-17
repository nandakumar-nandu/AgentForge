import { Router, Request, Response } from 'express';
import Agent from '../models/Agent';
import AgentJob from '../models/AgentJob';
import { agentQueue } from '../queues/agentQueue';

const router = Router();

/**
 * GET /api/agents
 * Retrieve all agents stored in the database.
 * Sorts them by creation time descending.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Step 1: Query the MongoDB database for all agent documents
    const agents = await Agent.find().sort({ createdAt: -1 });

    // Step 2: Return a 200 OK response with the list of agents
    res.status(200).json(agents);
  } catch (error: any) {
    // Step 3: Handle database or runtime query errors
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Server error retrieving agents', error: error.message });
  }
});

/**
 * POST /api/agents
 * Create a new agent document.
 * Requires: name, type, systemPrompt, model, optional status.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Step 1: Extract field values from request body
    const { name, type, systemPrompt, model, status } = req.body;

    // Step 2: Create a new instance of the Agent model
    const newAgent = new Agent({
      name,
      type,
      systemPrompt,
      model,
      status: status || 'active' // Defaults to active if not provided
    });

    // Step 3: Save the agent document to MongoDB (triggers schema validations)
    const savedAgent = await newAgent.save();

    // Step 4: Return 201 Created status and the newly created agent record
    res.status(201).json(savedAgent);
  } catch (error: any) {
    // Step 5: Check if it's a validation error and return a 400 Bad Request
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val: any) => val.message);
      return res.status(400).json({ message: 'Validation failed', errors: messages });
    }
    
    // Step 6: Handle general database save failures
    console.error('Error creating agent:', error);
    res.status(500).json({ message: 'Server error creating agent', error: error.message });
  }
});

/**
 * GET /api/agents/:id
 * Retrieve details of a single agent by its unique object ID.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Step 1: Retrieve the ID parameter from the request path
    const { id } = req.params;

    // Step 2: Query MongoDB for the agent doc matching the ID
    const agent = await Agent.findById(id);

    // Step 3: If no document matches, return 404 Not Found
    if (!agent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    // Step 4: Return 200 OK and the agent document details
    res.status(200).json(agent);
  } catch (error: any) {
    // Step 5: Check if it is an invalid Mongoose ObjectId format
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }

    // Step 6: Handle internal server exceptions
    console.error('Error fetching agent details:', error);
    res.status(500).json({ message: 'Server error retrieving agent details', error: error.message });
  }
});

/**
 * PUT /api/agents/:id
 * Update properties of an existing agent.
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    // Step 1: Retrieve ID parameter and fields from the request
    const { id } = req.params;
    const { name, type, systemPrompt, model, status } = req.body;

    // Step 2: Perform update query using findByIdAndUpdate
    // { new: true } returns the modified document rather than the original
    // { runValidators: true } enforces schema rules on the updated content
    const updatedAgent = await Agent.findByIdAndUpdate(
      id,
      { name, type, systemPrompt, model, status },
      { new: true, runValidators: true }
    );

    // Step 3: Return 404 if the document was not found or already deleted
    if (!updatedAgent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    // Step 4: Return 200 OK and the newly updated agent document
    res.status(200).json(updatedAgent);
  } catch (error: any) {
    // Step 5: Handle validator failures for edited fields
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val: any) => val.message);
      return res.status(400).json({ message: 'Validation failed', errors: messages });
    }
    // Step 6: Handle bad ObjectId formats
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }
    // Step 7: Log database error details
    console.error('Error updating agent:', error);
    res.status(500).json({ message: 'Server error updating agent', error: error.message });
  }
});

/**
 * DELETE /api/agents/:id
 * Permanently remove an agent from the system database.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // Step 1: Retrieve the target ID parameter
    const { id } = req.params;

    // Step 2: Call Mongoose to find and remove the record
    const deletedAgent = await Agent.findByIdAndDelete(id);

    // Step 3: Return 404 if the agent wasn't found
    if (!deletedAgent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    // Step 4: Return 200 OK confirm successful deletion
    res.status(200).json({ message: `Agent '${deletedAgent.name}' successfully deleted` });
  } catch (error: any) {
    // Step 5: Handle bad formats
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }
    // Step 6: Handle server process failures
    console.error('Error deleting agent:', error);
    res.status(500).json({ message: 'Server error deleting agent', error: error.message });
  }
});

/**
 * POST /api/agents/:id/run
 * Accepts an array of input queries in the request body, registers a batch job in MongoDB,
 * schedules it on the BullMQ queue, and returns the jobId immediately.
 */
router.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { inputData } = req.body;

    // Step 1: Validate inputData parameter is a non-empty array
    if (!inputData || !Array.isArray(inputData) || inputData.length === 0) {
      return res.status(400).json({ message: "Request body parameter 'inputData' must be a non-empty array of strings" });
    }

    // Step 2: Validate that all array items are non-empty strings
    const allValidStrings = inputData.every(item => typeof item === 'string' && item.trim() !== "");
    if (!allValidStrings) {
      return res.status(400).json({ message: "All entries in 'inputData' must be non-empty strings" });
    }

    // Step 3: Check if the agent exists
    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    // Step 4: Create a new AgentJob log in MongoDB
    const agentJob = new AgentJob({
      agentId: id,
      inputData: inputData.map(str => str.trim()),
      status: 'pending',
      results: [],
      progress: 0
    });
    await agentJob.save();

    // Step 5: Enqueue the batch job task to the BullMQ Redis queue
    const bullJob = await agentQueue.add('batch-job', {
      jobId: agentJob._id.toString(),
      agentId: id,
      inputData: agentJob.inputData
    });

    console.info(`[Router] Enqueued job ${bullJob.id} for AgentJob ${agentJob._id}`);

    // Step 6: Return the jobId immediately to the client
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
