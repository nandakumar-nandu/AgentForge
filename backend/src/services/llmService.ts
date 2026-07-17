import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Agent from '../models/Agent';
import User from '../models/User';
import { decrypt } from '../utils/crypto';
import { calculateCost, logUsage } from './costService';

/**
 * Interface representing the completion result return type from chat.
 */
export interface ChatCompletionResult {
  reply: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

/**
 * Client Initializations
 */
const getOpenAIClient = (customApiKey?: string) => {
  const apiKey = customApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey.includes("your-openai-api-key")) {
    throw new Error('Unauthorized: OpenAI API Key is missing or invalid. Add OPENAI_API_KEY in backend/.env or your user settings.');
  }
  return new OpenAI({ apiKey });
};

const getAnthropicClient = (customApiKey?: string) => {
  const apiKey = customApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey.includes("your-claude-api-key")) {
    throw new Error('Unauthorized: Claude API Key is missing or invalid. Add ANTHROPIC_API_KEY in backend/.env or your user settings.');
  }
  return new Anthropic({ apiKey });
};

/**
 * Handles LLM API exceptions such as rate limits (429), timeouts (504/408), and bad auth credentials (401).
 */
function handleLLMError(error: any, providerName: string): never {
  console.error(`${providerName} service error encountered:`, error);
  const status = error.status || error.statusCode;

  if (status === 429) {
    throw new Error(`${providerName} API rate limit exceeded. Please back off and try again shortly.`);
  }
  if (status === 401) {
    throw new Error(`Authentication failure. The configured ${providerName} API Key is invalid or expired.`);
  }
  if (error.name === 'TimeoutError' || status === 504 || status === 408) {
    throw new Error(`${providerName} API request timed out. Please check network status.`);
  }

  throw new Error(error.message || `An error occurred while communicating with the ${providerName} engine.`);
}

/**
 * Chat Completions router.
 * Maps prompt schemas to target engines (gpt-4o or claude-3-5-sonnet).
 * 
 * Invokes cost calculations and logs usage metrics after successful completions.
 */
export async function chat(
  agentId: string,
  userMessage: string,
  history: Array<{ sender: 'user' | 'agent'; content: string }>,
  userId?: string,
  jobId?: string
): Promise<ChatCompletionResult> {
  // Step 1: Resolve the target agent settings
  const agent = await Agent.findById(agentId);
  if (!agent) {
    throw new Error(`Agent with ID ${agentId} not found in database`);
  }

  const { systemPrompt, model } = agent;

  // Step 2: Resolve user-level API Key override if authenticated
  let customApiKey: string | undefined = undefined;

  if (userId) {
    try {
      const user = await User.findById(userId);
      if (user) {
        if (model === 'gpt-4o' && user.openaiKeyEncrypted && user.openaiKeyIv) {
          customApiKey = decrypt(user.openaiKeyEncrypted, user.openaiKeyIv);
        } else if (model === 'claude-3-5-sonnet' && user.claudeKeyEncrypted && user.claudeKeyIv) {
          customApiKey = decrypt(user.claudeKeyEncrypted, user.claudeKeyIv);
        }
      }
    } catch (err: any) {
      console.error('[llmService] Error loading user-specific API key overrides:', err.message);
    }
  }

  // Step 3: Check if we should run in Simulated Fallback Mode
  const hasOpenAIKey = customApiKey || (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("your-openai"));
  const hasClaudeKey = customApiKey || (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes("your-claude"));

  const runOpenAI = model === 'gpt-4o';
  const isKeyConfigured = runOpenAI ? !!hasOpenAIKey : !!hasClaudeKey;

  if (!isKeyConfigured) {
    console.info(`[Simulation Mode] Generating mock response for Agent: ${agent.name} (Model: ${model})`);
    
    // Simulate thinking lag
    await new Promise((resolve) => setTimeout(resolve, 800));

    const reply = `[Simulated Response - No ${runOpenAI ? "OpenAI" : "Claude"} API Key Set]
I am ${agent.name}, acting under instructions: "${systemPrompt.substring(0, 50)}...".
I received your input: "${userMessage}".

To test live responses, please configure your active keys inside backend/.env or your settings panel.`;

    // Simulated token metrics
    const inputTokens = 85;
    const outputTokens = 120;
    const cost = 0.0; // Simulated costs are free

    return {
      reply,
      inputTokens,
      outputTokens,
      cost
    };
  }

  // Step 4: Dispatch API Requests
  if (runOpenAI) {
    try {
      const openai = getOpenAIClient(customApiKey);

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt }
      ];

      for (const msg of history) {
        messages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }

      messages.push({ role: 'user', content: userMessage });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        max_tokens: 800,
        temperature: 0.7
      });

      const reply = completion.choices[0]?.message?.content || 'No completion returned from OpenAI.';
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      const cost = calculateCost('gpt-4o', inputTokens, outputTokens);

      // Auto-log to UsageLog collection in MongoDB
      await logUsage({
        agentId: agent._id.toString(),
        userId: userId || '60f79b001efab00123456789', // Fallback local sandbox user
        jobId,
        model: 'gpt-4o',
        inputTokens,
        outputTokens,
        conversationType: jobId ? 'batch' : 'chat'
      });

      return {
        reply,
        inputTokens,
        outputTokens,
        cost
      };
    } catch (error: any) {
      return handleLLMError(error, 'OpenAI');
    }
  } else {
    try {
      const anthropic = getAnthropicClient(customApiKey);

      const messages: Anthropic.MessageParam[] = [];

      for (const msg of history) {
        messages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }

      messages.push({ role: 'user', content: userMessage });

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        system: systemPrompt,
        messages,
        max_tokens: 800,
        temperature: 0.7
      });

      const textBlock = response.content[0];
      const reply = (textBlock && textBlock.type === 'text') ? textBlock.text : 'No text content returned from Claude messages client.';
      
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const cost = calculateCost('claude-3-5-sonnet', inputTokens, outputTokens);

      // Auto-log to UsageLog collection in MongoDB
      await logUsage({
        agentId: agent._id.toString(),
        userId: userId || '60f79b001efab00123456789',
        jobId,
        model: 'claude-3-5-sonnet',
        inputTokens,
        outputTokens,
        conversationType: jobId ? 'batch' : 'chat'
      });

      return {
        reply,
        inputTokens,
        outputTokens,
        cost
      };
    } catch (error: any) {
      return handleLLMError(error, 'Claude');
    }
  }
}
