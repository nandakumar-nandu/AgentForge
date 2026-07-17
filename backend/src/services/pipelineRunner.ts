import mongoose from 'mongoose';
import Pipeline from '../models/Pipeline';
import PipelineRun from '../models/PipelineRun';
import { chat } from './llmService';
import { getIO } from './socketService';

/**
 * ============================================================================
 * CONTEXT ACCUMULATION AND CHAINING EXECUTION STRATEGY:
 * ============================================================================
 * 
 * 1. Accumulation vs Concatenation:
 *    Rather than raw concatenation of outputs (which pollutes token count and causes
 *    context drift), we pass a structured key-value context object:
 *    `context = { "user_input": initialInput, "step1_summary": summaryText }`
 *    This allows downstream agents to isolate, identify, and parse specific earlier
 *    step results by name.
 * 
 * 2. Error Isolation and Wallet Protection:
 *    If step N fails, we mark it as failed and immediately stop the pipeline.
 *    Continuing downstream steps when parent inputs are missing or broken would lead
 *    to wasted LLM API tokens and inaccurate calculations, wasting the developer's money.
 * ============================================================================
 */

/**
 * Initiates the sequential runner for a pipeline execution.
 * Returns the generated PipelineRun ID immediately, processing the steps asynchronously.
 */
export async function runPipeline(
  pipelineId: string,
  initialInput: string,
  userId: string
): Promise<string> {
  const pipeline = await Pipeline.findById(pipelineId).populate('steps.agentId');
  if (!pipeline) {
    throw new Error(`Pipeline with ID ${pipelineId} not found`);
  }

  // 1. Map steps to initial pending results
  const stepResults = pipeline.steps.map(step => ({
    stepOrder: step.order,
    agentId: step.agentId as any,
    input: '',
    output: '',
    tokensUsed: 0,
    costUSD: 0,
    durationMs: 0,
    status: 'pending' as const
  }));

  // 2. Create the run tracking document
  const pipelineRun = new PipelineRun({
    pipelineId: pipeline._id,
    userId: new mongoose.Types.ObjectId(userId),
    initialInput,
    stepResults,
    overallStatus: 'running',
    totalCostUSD: 0,
    startedAt: new Date()
  });

  await pipelineRun.save();

  // 3. Trigger execution loop asynchronously
  executeRunner(pipeline, pipelineRun, initialInput, userId).catch(err => {
    console.error(`[pipelineRunner] Run execution failed for ID ${pipelineRun._id}:`, err);
  });

  return pipelineRun._id.toString();
}

/**
 * Sequential execution worker loop.
 */
async function executeRunner(
  pipeline: any,
  pipelineRun: any,
  initialInput: string,
  userId: string
) {
  let ioInstance;
  try {
    ioInstance = getIO();
  } catch (err) {
    console.warn('[pipelineRunner] Socket.io not initialized. Running without live websocket updates.');
  }

  const runId = pipelineRun._id.toString();
  const pipelineIdStr = pipeline._id.toString();

  // Initialize context map
  const context: Record<string, string> = {
    user_input: initialInput
  };

  let totalCost = 0;
  let overallFailed = false;

  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i];
    const stepIndex = i;

    // Event 1: pipeline:stepStarted
    if (ioInstance) {
      ioInstance.emit('pipeline:stepStarted', {
        pipelineId: pipelineIdStr,
        pipelineRunId: runId,
        stepOrder: step.order
      });
    }

    pipelineRun.stepResults[stepIndex].status = 'running';
    await pipelineRun.save();

    const startTime = Date.now();

    // Resolve Step Input Source
    let stepInput = '';
    if (step.inputSource === 'user_input') {
      stepInput = initialInput;
    } else {
      // Find output from previous steps by key, or fallback to user_input
      stepInput = context[step.inputSource] || context['user_input'] || '';
    }

    pipelineRun.stepResults[stepIndex].input = stepInput;
    await pipelineRun.save();

    try {
      // Inject accumulated key-value parameters into user query instructions
      const contextString = Object.entries(context)
        .map(([key, val]) => `### Context parameter [${key}]:\n${val}`)
        .join('\n\n');

      const enrichedPrompt = `--- Accumulated Context ---\n${contextString}\n\n--- Step Prompt Input ---\n${stepInput}`;

      // Call LLM Router
      const chatResult = await chat(step.agentId._id.toString(), enrichedPrompt, [], userId);

      let stepOutput = chatResult.reply;
      let stepCost = chatResult.cost;
      let stepInputTokens = chatResult.inputTokens;
      let stepOutputTokens = chatResult.outputTokens;

      // Run optional transformation formatting prompt if configured
      if (step.transformPrompt && step.transformPrompt.trim() !== '') {
        const transformPromptPayload = `Original response content:\n${stepOutput}\n\nReshape instructions:\n${step.transformPrompt}`;
        const transformResult = await chat(step.agentId._id.toString(), transformPromptPayload, [], userId);
        
        stepOutput = transformResult.reply;
        stepCost += transformResult.cost;
        stepInputTokens += transformResult.inputTokens;
        stepOutputTokens += transformResult.outputTokens;
      }

      const duration = Date.now() - startTime;

      // Save generated text in context map
      context[step.outputKey] = stepOutput;

      // Update Step Record
      pipelineRun.stepResults[stepIndex].output = stepOutput;
      pipelineRun.stepResults[stepIndex].tokensUsed = stepInputTokens + stepOutputTokens;
      pipelineRun.stepResults[stepIndex].costUSD = stepCost;
      pipelineRun.stepResults[stepIndex].durationMs = duration;
      pipelineRun.stepResults[stepIndex].status = 'completed';

      totalCost += stepCost;
      await pipelineRun.save();

      // Event 2: pipeline:stepCompleted
      if (ioInstance) {
        ioInstance.emit('pipeline:stepCompleted', {
          pipelineId: pipelineIdStr,
          pipelineRunId: runId,
          stepOrder: step.order,
          output: stepOutput
        });
      }

    } catch (stepError: any) {
      console.error(`[pipelineRunner] Step ${step.order} failed:`, stepError.message);
      overallFailed = true;

      const duration = Date.now() - startTime;
      pipelineRun.stepResults[stepIndex].status = 'failed';
      pipelineRun.stepResults[stepIndex].output = `Error executing step: ${stepError.message || 'LLM completion error'}`;
      pipelineRun.stepResults[stepIndex].durationMs = duration;
      await pipelineRun.save();

      // Event 3: pipeline:stepFailed
      if (ioInstance) {
        ioInstance.emit('pipeline:stepFailed', {
          pipelineId: pipelineIdStr,
          pipelineRunId: runId,
          stepOrder: step.order,
          error: stepError.message || 'LLM completion error'
        });
      }

      // Halting downstream executions (Error Isolation)
      break;
    }
  }

  // 4. Conclude execution run
  pipelineRun.overallStatus = overallFailed ? 'failed' : 'completed';
  pipelineRun.totalCostUSD = totalCost;
  pipelineRun.completedAt = new Date();
  await pipelineRun.save();

  // Event 4: pipeline:completed
  if (ioInstance) {
    ioInstance.emit('pipeline:completed', {
      pipelineId: pipelineIdStr,
      pipelineRunId: runId,
      status: pipelineRun.overallStatus,
      results: context
    });
  }
}
