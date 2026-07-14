// Shared TypeScript models and interfaces for AgentForge

export type LLMProvider = 'openai' | 'anthropic';

export type AgentStatus = 'idle' | 'running' | 'paused' | 'failed';

export interface Agent {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  llmProvider: LLMProvider;
  model: string;
  temperature: number;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface Job {
  id: string;
  agentId: string;
  status: JobStatus;
  input: string;
  output?: string;
  error?: string;
  tokensUsed?: number;
  latency?: number; // in milliseconds
  createdAt: string;
  completedAt?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  promptText: string;
  variables: string[];
  category: string;
  createdAt: string;
}

export interface SystemSettings {
  openaiApiKey?: string;
  claudeApiKey?: string;
  mongodbUri?: string;
  redisUrl?: string;
  defaultTemperature: number;
  concurrencyLimit: number;
}

export interface ServiceHealth {
  status: 'connected' | 'disconnected' | 'error';
  message?: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  version: string;
  timestamp: string;
  services: {
    mongodb: ServiceHealth;
    redis: ServiceHealth;
  };
}
