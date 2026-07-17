import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Agent from '../models/Agent';
import User from '../models/User';
import { decrypt } from '../utils/crypto';

/**
 * Client Initializations
 * 
 * OpenAI and Anthropic API clients are loaded dynamically using environmental configurations
 * declared in the backend .env file (OPENAI_API_KEY and ANTHROPIC_API_KEY) or retrieved
 * from the user's decrypted configuration settings in MongoDB.
 * 
 * Token Management & Cost Awareness:
 * - We specify max_tokens limits (e.g. 800) to avoid runaway loop costs.
 * - System prompts are injected at structural query levels (OpenAI role: system, Claude system parameter) 
 *   to ensure context efficiency and prevent instruction leakage.
 * - Conversation histories are appended sequentially to sustain context state, while maintaining
 *   size throttles in production.
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
 * Supports user-specific key decryption, falling back to system keys or mock responses
 * if no keys are configured.
 */
export async function chat(
  agentId: string,
  userMessage: string,
  history: Array<{ sender: 'user' | 'agent'; content: string }>,
  userId?: string
): Promise<string> {
  // Step 1: Resolve the target agent settings
  const agent = await Agent.findById(agentId);
  if (!agent) {
    throw new Error(`Agent with ID ${agentId} not found in database`);
  }

  const { systemPrompt, model } = agent;

  // Step 2: Resolve user-level API Key override if authenticated and key exists
  let customApiKey: string | undefined = undefined;

  if (userId) {
    try {
      const user = await User.findById(userId);
      if (user) {
        if (model === 'gpt-4o' && user.openaiKeyEncrypted && user.openaiKeyIv) {
          customApiKey = decrypt(user.openaiKeyEncrypted, user.openaiKeyIv);
          console.info(`[llmService] Using decrypted custom OpenAI key for User: ${user.username}`);
        } else if (model === 'claude-3-5-sonnet' && user.claudeKeyEncrypted && user.claudeKeyIv) {
          customApiKey = decrypt(user.claudeKeyEncrypted, user.claudeKeyIv);
          console.info(`[llmService] Using decrypted custom Claude key for User: ${user.username}`);
        }
      }
    } catch (err: any) {
      console.error('[llmService] Error loading user-specific API key overrides:', err.message);
    }
  }

  // Step 3: Check if we should run in Simulated Fallback Mode due to unconfigured keys
  const hasOpenAIKey = customApiKey || (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("your-openai"));
  const hasClaudeKey = customApiKey || (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes("your-claude"));

  const runOpenAI = model === 'gpt-4o';
  const isKeyConfigured = runOpenAI ? !!hasOpenAIKey : !!hasClaudeKey;

  if (!isKeyConfigured) {
    // Generate a mock response simulating the persona for developer demo ease
    console.info(`[Simulation Mode] Generating mock response for Agent: ${agent.name} (Model: ${model})`);
    
    // Simulate thinking lag
    await new Promise((resolve) => setTimeout(resolve, 800));

    return `[Simulated Response - No ${runOpenAI ? "OpenAI" : "Claude"} API Key Set]
I am ${agent.name}, acting under instructions: "${systemPrompt.substring(0, 50)}...".
I received your input: "${userMessage}".

To test live responses, please configure your active keys inside backend/.env or your settings panel.`;
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

      return completion.choices[0]?.message?.content || 'No completion returned from OpenAI.';
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
      if (textBlock && textBlock.type === 'text') {
        return textBlock.text;
      }
      return 'No text content returned from Claude messages client.';
    } catch (error: any) {
      return handleLLMError(error, 'Claude');
    }
  }
}
