import { Router, Response, Request } from 'express';
import Agent from '../models/Agent';
import ChatMessage from '../models/ChatMessage';
import { chat } from '../services/llmService';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/**
 * GET /api/agents/:id/chat
 * Retrieves conversation history for the specified agent.
 * Protected by JWT Auth middleware.
 */
router.get('/:id/chat', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify that the agent exists in the database
    const agentExists = await Agent.findById(id);
    if (!agentExists) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    // Query for all message logs matching this agent ID
    const messages = await ChatMessage.find({ agentId: id }).sort({ timestamp: 1 });

    // Return the historical messages log
    res.status(200).json(messages);
  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }
    console.error('Error fetching chat history:', error);
    res.status(500).json({ message: 'Server error fetching chat history', error: error.message });
  }
});

/**
 * POST /api/agents/:id/chat
 * Receives a prompt, queries history, calls LLM, saves dialogue blocks, and returns response.
 * Protected by JWT Auth middleware.
 */
router.post('/:id/chat', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = authReq.user?.userId;

    // Validate prompt input
    if (!message || message.trim() === "") {
      return res.status(400).json({ message: "Request body parameter 'message' is required" });
    }

    // Verify target agent configurations
    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    // Fetch historical messages context to construct LLM conversation boundaries
    const messageLogs = await ChatMessage.find({ agentId: id }).sort({ timestamp: 1 });
    const history = messageLogs.map(log => ({
      sender: log.sender,
      content: log.content
    }));

    // Dispatch execution requests through LLM Service, passing user ID for decrypt override
    let reply = "";
    try {
      reply = await chat(id, message.trim(), history, userId);
    } catch (llmError: any) {
      console.warn("LLM API request execution failed", llmError.message);
      return res.status(502).json({ message: llmError.message || "Failed to contact LLM API provider" });
    }

    // Save user prompt block to database
    const userMsg = new ChatMessage({
      agentId: id,
      sender: 'user',
      content: message.trim()
    });
    await userMsg.save();

    // Save agent reply block to database
    const agentMsg = new ChatMessage({
      agentId: id,
      sender: 'agent',
      content: reply
    });
    await agentMsg.save();

    // Return final response and saved messages metadata
    res.status(200).json({
      reply,
      userMessage: userMsg,
      agentMessage: agentMsg
    });

  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }
    console.error('Error handling chat conversation:', error);
    res.status(500).json({ message: 'Server error handling chat session', error: error.message });
  }
});

export default router;
