import { Router, Request, Response } from 'express';
import Agent from '../models/Agent';
import ChatMessage from '../models/ChatMessage';
import { chat } from '../services/llmService';

const router = Router();

/**
 * GET /api/agents/:id/chat
 * Retrieves conversation history for the specified agent.
 * Sorted chronologically (timestamp ascending).
 */
router.get('/:id/chat', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Step 1: Verify that the agent exists in the database
    const agentExists = await Agent.findById(id);
    if (!agentExists) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    // Step 2: Query for all message logs matching this agent ID
    const messages = await ChatMessage.find({ agentId: id }).sort({ timestamp: 1 });

    // Step 3: Return the historical messages log
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
 * Receives a prompt, queries history, calls OpenAI/Claude, saves dialogue blocks, and returns the response.
 */
router.post('/:id/chat', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    // Step 1: Validate prompt input
    if (!message || message.trim() === "") {
      return res.status(400).json({ message: "Request body parameter 'message' is required" });
    }

    // Step 2: Verify target agent configurations
    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    // Step 3: Fetch historical messages context to construct LLM conversation boundaries
    const messageLogs = await ChatMessage.find({ agentId: id }).sort({ timestamp: 1 });
    const history = messageLogs.map(log => ({
      sender: log.sender,
      content: log.content
    }));

    // Step 4: Dispatch execution requests through LLM Service
    let reply = "";
    try {
      reply = await chat(id, message.trim(), history);
    } catch (llmError: any) {
      // Return 502 Bad Gateway if API calls fail (like bad API keys or timeouts)
      console.warn("LLM API request execution failed", llmError.message);
      return res.status(502).json({ message: llmError.message || "Failed to contact LLM API provider" });
    }

    // Step 5: Save user prompt block to database
    const userMsg = new ChatMessage({
      agentId: id,
      sender: 'user',
      content: message.trim()
    });
    await userMsg.save();

    // Step 6: Save agent reply block to database
    const agentMsg = new ChatMessage({
      agentId: id,
      sender: 'agent',
      content: reply
    });
    await agentMsg.save();

    // Step 7: Return final response and saved messages metadata
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
