import { Router, Response, Request } from 'express';
import mongoose from 'mongoose';
import Agent from '../models/Agent';
import AgentJob from '../models/AgentJob';
import ChatMessage from '../models/ChatMessage';
import UsageLog from '../models/UsageLog';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/**
 * GET /api/analytics/overview
 * Returns aggregate metrics for the platform:
 * - Total counts of agents, jobs, and overall conversations
 * - Total money spent in the current calendar month
 * - Name of the most active agent by request counts
 */
router.get('/overview', authMiddleware, async (req: Request, res: Response) => {
  try {
    // 1. Fetch total counts from database collections
    const totalAgents = await Agent.countDocuments();
    const totalJobs = await AgentJob.countDocuments();
    
    // Conversations count matches total chat sessions + total enqueued logs
    const totalChats = await ChatMessage.countDocuments();
    const totalConversations = await UsageLog.countDocuments();

    // 2. Aggregate monthly spend (from start of current month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const spendAgg = await UsageLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          totalSpend: { $sum: '$estimatedCostUSD' }
        }
      }
    ]);

    const totalSpendThisMonth = spendAgg.length > 0 ? spendAgg[0].totalSpend : 0;

    // 3. Find the most active agent by summing log requests counts
    const activeAgg = await UsageLog.aggregate([
      {
        $group: {
          _id: '$agentId',
          requestCount: { $sum: 1 }
        }
      },
      { $sort: { requestCount: -1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: 'agents',
          localField: '_id',
          foreignField: '_id',
          as: 'agentInfo'
        }
      }
    ]);

    const mostActiveAgent = activeAgg.length > 0 && activeAgg[0].agentInfo.length > 0
      ? activeAgg[0].agentInfo[0].name
      : 'No Active Agents';

    // 4. Aggregate cost totals per Agent for the cost chart (bar chart)
    const costPerAgentAgg = await UsageLog.aggregate([
      {
        $group: {
          _id: '$agentId',
          totalCost: { $sum: '$estimatedCostUSD' }
        }
      },
      {
        $lookup: {
          from: 'agents',
          localField: '_id',
          foreignField: '_id',
          as: 'agentInfo'
        }
      },
      { $unwind: '$agentInfo' },
      {
        $project: {
          agentId: '$_id',
          name: '$agentInfo.name',
          cost: '$totalCost'
        }
      },
      { $sort: { cost: -1 } }
    ]);

    res.status(200).json({
      totalAgents,
      totalJobs,
      totalChats,
      totalConversations,
      totalSpendThisMonth: Math.round(totalSpendThisMonth * 100) / 100, // round to 2 decimal places
      mostActiveAgent,
      costPerAgent: costPerAgentAgg
    });

  } catch (error: any) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({ message: 'Server error fetching overview analytics', error: error.message });
  }
});

/**
 * GET /api/analytics/agents/:id
 * Returns a per-agent breakdown:
 * - Count of chat messages vs enqueued batch jobs
 * - Daily token counts over the last 30 days
 * - Daily estimated costs over the last 30 days
 */
router.get('/agents/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agentObjectId = new mongoose.Types.ObjectId(id);

    // Verify agent exists
    const agent = await Agent.findById(id);
    if (!agent) {
      return res.status(404).json({ message: `Agent with ID ${id} not found` });
    }

    // 1. Fetch chat vs batch totals
    const totalChats = await UsageLog.countDocuments({ agentId: agentObjectId, conversationType: 'chat' });
    const totalBatchRuns = await UsageLog.countDocuments({ agentId: agentObjectId, conversationType: 'batch' });

    // 2. Fetch 30-day token and cost distribution in daily buckets
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const dailyUsageAgg = await UsageLog.aggregate([
      {
        $match: {
          agentId: agentObjectId,
          timestamp: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          cost: { $sum: '$estimatedCostUSD' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Format aggregate to standard arrays
    const dailyData = dailyUsageAgg.map(item => ({
      date: item._id,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      totalTokens: item.inputTokens + item.outputTokens,
      cost: Math.round(item.cost * 1000) / 1000
    }));

    res.status(200).json({
      agent: {
        id: agent._id,
        name: agent.name,
        model: agent.model
      },
      totalChats,
      totalBatchRuns,
      dailyUsage: dailyData
    });

  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid agent ID format' });
    }
    console.error('Error fetching per-agent analytics:', error);
    res.status(500).json({ message: 'Server error retrieving agent analytics', error: error.message });
  }
});

/**
 * GET /api/analytics/usage
 * Returns paginated telemetry log lists. Filters:
 * - agentId (Mongoose ObjectId)
 * - model (gpt-4o | claude-3-5-sonnet)
 * - dateRange (startDate, endDate query mappings)
 */
router.get('/usage', authMiddleware, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const { agentId, model, startDate, endDate } = req.query;

    // 1. Build dynamic MongoDB query filter
    const queryFilter: any = {};

    if (agentId && agentId !== 'all') {
      queryFilter.agentId = new mongoose.Types.ObjectId(agentId as string);
    }
    if (model && model !== 'all') {
      queryFilter.model = model as string;
    }
    if (startDate || endDate) {
      queryFilter.timestamp = {};
      if (startDate) {
        queryFilter.timestamp.$gte = new Date(startDate as string);
      }
      if (endDate) {
        queryFilter.timestamp.$lte = new Date(endDate as string);
      }
    }

    // 2. Fetch total document count to support client pagination
    const totalCount = await UsageLog.countDocuments(queryFilter);

    // 3. Query paginated logs collection, populated with agent metadata
    const logs = await UsageLog.find(queryFilter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('agentId', 'name');

    res.status(200).json({
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      logs
    });

  } catch (error: any) {
    console.error('Error querying analytics usage logs:', error);
    res.status(500).json({ message: 'Server error querying usage logs', error: error.message });
  }
});

export default router;
