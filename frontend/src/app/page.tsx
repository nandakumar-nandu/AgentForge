"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Bot,
  Activity,
  FileCode2,
  Settings,
  RefreshCw,
  AlertCircle,
  Database,
  Server,
  Plus,
  Play,
  Cpu,
  Clock,
  Coins,
  ArrowUpRight,
  Sparkles
} from "lucide-react";
import { Agent, Job, PromptTemplate, SystemSettings, HealthCheckResponse } from "@agentforge/shared";
import AgentsPage from "../pages/Agents";
import JobsPage from "../pages/Jobs";

// High-fidelity Mock Data matching Shared Types
const MOCK_AGENTS: Agent[] = [
  {
    id: "agent-1",
    name: "DocuSummarizer",
    description: "Extracts key insights and generates executive summaries from technical documents.",
    status: "idle",
    llmProvider: "anthropic",
    model: "claude-3-5-sonnet-20240620",
    temperature: 0.2,
    systemPrompt: "You are an expert technical editor. Summarize the following document into actionable bullet points.",
    createdAt: "2026-07-10T10:00:00Z",
    updatedAt: "2026-07-14T11:00:00Z"
  },
  {
    id: "agent-2",
    name: "CodeReviewer-GPT4",
    description: "Analyzes TypeScript pull requests for safety, performance, and formatting issues.",
    status: "running",
    llmProvider: "openai",
    model: "gpt-4o",
    temperature: 0.0,
    systemPrompt: "Perform a strict code review on the provided diff. Focus on security flaws and typescript safety.",
    createdAt: "2026-07-11T12:30:00Z",
    updatedAt: "2026-07-14T12:00:00Z"
  },
  {
    id: "agent-3",
    name: "MarketAnalyst",
    description: "Scrapes financial feeds and synthesizes daily trend reports.",
    status: "paused",
    llmProvider: "openai",
    model: "gpt-4-turbo",
    temperature: 0.7,
    systemPrompt: "Generate a daily market report outline using the provided data points.",
    createdAt: "2026-07-12T09:15:00Z",
    updatedAt: "2026-07-13T18:00:00Z"
  }
];

const MOCK_JOBS: Job[] = [
  {
    id: "job-101",
    agentId: "agent-2",
    status: "completed",
    input: "git diff HEAD~1",
    output: "### Code Review Summary\n- **Security**: No issues found.\n- **Refactoring**: Suggest optimizing line 45 with a hash map.",
    tokensUsed: 1240,
    latency: 1845,
    createdAt: "2026-07-14T13:10:00Z",
    completedAt: "2026-07-14T13:10:02Z"
  },
  {
    id: "job-102",
    agentId: "agent-2",
    status: "active",
    input: "git diff origin/main",
    tokensUsed: 840,
    latency: 900,
    createdAt: "2026-07-14T13:30:00Z"
  },
  {
    id: "job-103",
    agentId: "agent-1",
    status: "failed",
    input: "PDF upload: whitepaper_v3.pdf",
    error: "Anthropic API Timeout - rate limit exceeded",
    createdAt: "2026-07-14T12:45:00Z",
    completedAt: "2026-07-14T12:45:05Z"
  },
  {
    id: "job-104",
    agentId: "agent-3",
    status: "pending",
    input: "Scrape ticker info: AAPL, GOOG, TSLA",
    createdAt: "2026-07-14T13:32:00Z"
  }
];

const MOCK_TEMPLATES: PromptTemplate[] = [
  {
    id: "tpl-1",
    name: "Structured Summary",
    description: "Ideal for compressing raw articles into standard formats.",
    promptText: "Summarize the following text in under {{maxWords}} words. Target audience: {{audience}}.\nText: {{text}}",
    variables: ["maxWords", "audience", "text"],
    category: "General Summarization",
    createdAt: "2026-07-09T08:00:00Z"
  },
  {
    id: "tpl-2",
    name: "TypeScript Refactoring",
    description: "Optimizes logic, enforces types, and adheres to clean code guidelines.",
    promptText: "Refactor this TypeScript function for maximum efficiency and readability: \n\n{{code}}",
    variables: ["code"],
    category: "Software Engineering",
    createdAt: "2026-07-10T14:22:00Z"
  }
];

const DEFAULT_SETTINGS: SystemSettings = {
  openaiApiKey: "sk-proj-••••••••••••••••••••",
  claudeApiKey: "sk-ant-••••••••••••••••••••",
  mongodbUri: "mongodb://localhost:27017/agentforge",
  redisUrl: "redis://localhost:6379",
  defaultTemperature: 0.5,
  concurrencyLimit: 5
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "agents" | "jobs" | "templates" | "settings">("dashboard");
  
  // Health connection state
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Settings State
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);

  const fetchHealth = async () => {
    setLoadingHealth(true);
    setHealthError(null);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
      const res = await fetch(`${backendUrl}/health`);
      if (!res.ok) {
        // Parse error response if possible
        const errJson = await res.json().catch(() => null);
        if (errJson) {
          setHealth(errJson);
          throw new Error("Some backend dependencies are unhealthy");
        }
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      setHealth(data);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to reach backend";
      console.warn("Backend health connection failed", errMsg);
      setHealthError(errMsg);
      // If we got a status 503 and parsed JSON, we already saved it in setHealth
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Poll health status every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Header */}
          <div className="p-6 border-b border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                AgentForge
              </h1>
              <span className="text-[10px] text-slate-400 tracking-wider uppercase font-semibold font-mono">
                AI Orchestrator
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {[
              { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
              { id: "agents", label: "Agents", icon: Bot },
              { id: "jobs", label: "Jobs Queue", icon: Activity },
              { id: "templates", label: "Templates", icon: FileCode2 },
              { id: "settings", label: "Settings", icon: Settings }
            ].map((item) => {
              const IconComp = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as "dashboard" | "agents" | "jobs" | "templates" | "settings")}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-250 group ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <IconComp className={`w-4 h-4 transition-transform group-hover:scale-110 ${isActive ? "text-white" : "text-slate-400"}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer - Real-time System Status */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Backend Health</span>
            <button
              onClick={fetchHealth}
              disabled={loadingHealth}
              className="text-slate-400 hover:text-slate-200 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Live Indicator Alert */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {health && !healthError ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </>
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </>
                )}
              </span>
              <span className="text-xs font-mono font-medium text-slate-300">
                {health && !healthError ? "Server Connected" : "Connection Down"}
              </span>
            </div>

            {/* Sub-services breakdown */}
            <div className="text-[10px] space-y-1 font-mono text-slate-500">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Database className="w-2.5 h-2.5" /> MongoDB:
                </span>
                <span className={health?.services?.mongodb?.status === "connected" ? "text-emerald-500" : "text-rose-500"}>
                  {health?.services?.mongodb?.status === "connected" ? "OK" : "ERR"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Server className="w-2.5 h-2.5" /> Redis Queue:
                </span>
                <span className={health?.services?.redis?.status === "connected" ? "text-emerald-500" : "text-rose-500"}>
                  {health?.services?.redis?.status === "connected" ? "OK" : "ERR"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-slate-950">
        
        {/* Top Header */}
        <header className="h-16 border-b border-slate-800/80 px-8 flex items-center justify-between shrink-0 bg-slate-900/10 backdrop-blur-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-100 capitalize">
              {activeTab === "dashboard" ? "System Overview" : `${activeTab} Management`}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800 font-mono">
              Role: System Administrator
            </span>
          </div>
        </header>

        {/* Dynamic Panels */}
        <div className="p-8 max-w-7xl w-full mx-auto space-y-6">
          
          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Promo Banner / Status summary */}
              <div className="relative p-6 bg-gradient-to-r from-blue-950 to-slate-900 border border-blue-900/40 rounded-xl overflow-hidden shadow-2xl">
                <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-10 bg-[radial-gradient(circle_at_center,theme(colors.blue.500)_0%,transparent_70%)] pointer-events-none" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                    <Sparkles className="w-4 h-4" /> AgentForge Status initialized
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight text-white">Scaffolding Commit 1 Active</h3>
                  <p className="text-slate-400 text-sm max-w-xl">
                    Monorepo scaffold config loaded. Next steps include implementing agent schemas, OpenAI/Claude logic pipelines, and real-time job execution queue.
                  </p>
                </div>
              </div>

              {/* Grid of stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: "Active Agents", value: "3", sub: "1 running, 1 idle, 1 paused", icon: Bot, color: "text-blue-500" },
                  { label: "Total Executed Jobs", value: "104", sub: "98.4% success rate", icon: Activity, color: "text-cyan-500" },
                  { label: "Total LLM Cost", value: "$4.12", sub: "128,450 tokens used", icon: Coins, color: "text-emerald-500" },
                  { label: "Avg Job Latency", value: "1.34s", sub: "Redis BullMQ Queue", icon: Clock, color: "text-violet-500" }
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div key={i} className="p-6 bg-slate-900/60 border border-slate-800/80 rounded-xl hover:border-slate-700/80 transition-all duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">{stat.label}</span>
                        <Icon className={`w-5 h-5 ${stat.color}`} />
                      </div>
                      <div className="mt-4">
                        <h4 className="text-3xl font-bold tracking-tight text-slate-100">{stat.value}</h4>
                        <span className="text-[11px] text-slate-500 mt-1 block font-mono">{stat.sub}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Content Split columns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Col: Recent Activity */}
                <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-slate-200 text-sm tracking-wide uppercase">Recent Operations Queue</h3>
                    <span className="text-xs text-blue-400 flex items-center gap-1 cursor-pointer hover:underline" onClick={() => setActiveTab("jobs")}>
                      View Queue <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  <div className="divide-y divide-slate-800/60 font-mono text-xs">
                    {MOCK_JOBS.slice(0, 3).map((job) => (
                      <div key={job.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${
                            job.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                            job.status === "active" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse" :
                            job.status === "failed" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                            "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>
                            {job.status}
                          </span>
                          <span className="text-slate-300 font-semibold">{job.id}</span>
                          <span className="text-slate-500 font-sans">Input: {job.input.substring(0, 30)}...</span>
                        </div>
                        <div className="text-slate-500">
                          {job.completedAt ? "Done" : "Pending"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Col: Connection & Config Status */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
                  <h3 className="font-bold text-slate-200 text-sm tracking-wide uppercase">Infrastructure Status</h3>
                  
                  {healthError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Backend offline</p>
                        <p className="text-[10px] text-rose-500/80 mt-1 font-mono">Ensure MongoDB + Redis are started on local and Express server is listening on port 5001.</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 font-sans text-xs">
                    <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-lg border border-slate-800/60">
                      <span className="text-slate-400 font-medium">MongoDB Connection</span>
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                        health?.services?.mongodb?.status === "connected" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                      }`}>
                        {health?.services?.mongodb?.status || "disconnected"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-lg border border-slate-800/60">
                      <span className="text-slate-400 font-medium">Redis Connection</span>
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                        health?.services?.redis?.status === "connected" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                      }`}>
                        {health?.services?.redis?.status || "disconnected"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-lg border border-slate-800/60">
                      <span className="text-slate-400 font-medium">Shared Models Package</span>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-blue-500/10 text-blue-400">
                        @agentforge/shared
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2: AGENTS LIST */}
          {activeTab === "agents" && (
            <AgentsPage />
          )}

          {/* TAB 3: JOBS QUEUE */}
          {activeTab === "jobs" && (
            <JobsPage />
          )}

          {/* TAB 4: TEMPLATES */}
          {activeTab === "templates" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">Prompt Templates</h3>
                  <p className="text-slate-400 text-xs mt-1">Reusable prompts for fast agent deployment with variable placeholders.</p>
                </div>
                <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-md shadow-blue-600/10 opacity-80 cursor-not-allowed">
                  <Plus className="w-4 h-4" /> Add Template (🚧)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {MOCK_TEMPLATES.map((tpl) => (
                  <div key={tpl.id} className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-200">{tpl.name}</h4>
                        <span className="text-[10px] text-slate-500 mt-1 block">Category: {tpl.category}</span>
                      </div>
                      <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded font-mono font-bold">
                        {tpl.id}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">{tpl.description}</p>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Template Body</span>
                      <pre className="bg-slate-950 p-4 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-400 leading-relaxed whitespace-pre-wrap overflow-x-auto">
                        {tpl.promptText}
                      </pre>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-2 items-center">
                      <span className="text-[10px] text-slate-500 font-bold uppercase mr-1">Variables:</span>
                      {tpl.variables.map((v, i) => (
                        <span key={i} className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300">
                          {"{{" + v + "}}"}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold">System Settings</h3>
                <p className="text-slate-400 text-xs mt-1">Configure global API bindings and pipeline parameters.</p>
              </div>

              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-6 max-w-2xl space-y-6">
                
                {/* LLM Key Binding */}
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-300 text-sm uppercase tracking-wider">LLM API Key Settings</h4>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 block">OpenAI API Key</label>
                    <input
                      type="password"
                      value={settings.openaiApiKey}
                      onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                      placeholder="sk-proj-..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 block">Claude API Key</label>
                    <input
                      type="password"
                      value={settings.claudeApiKey}
                      onChange={(e) => setSettings({ ...settings, claudeApiKey: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                      placeholder="sk-ant-..."
                    />
                  </div>
                </div>

                {/* Infrastructure URIs */}
                <div className="space-y-4 border-t border-slate-800/60 pt-6">
                  <h4 className="font-bold text-slate-300 text-sm uppercase tracking-wider">Infrastructure Connections</h4>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 block">MongoDB URI</label>
                    <input
                      type="text"
                      value={settings.mongodbUri}
                      onChange={(e) => setSettings({ ...settings, mongodbUri: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                      placeholder="mongodb://localhost:27017/..."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 block">Redis Connection URL</label>
                    <input
                      type="text"
                      value={settings.redisUrl}
                      onChange={(e) => setSettings({ ...settings, redisUrl: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                      placeholder="redis://localhost:6379"
                    />
                  </div>
                </div>

                {/* Run parameters */}
                <div className="space-y-4 border-t border-slate-800/60 pt-6">
                  <h4 className="font-bold text-slate-300 text-sm uppercase tracking-wider">Default Runner Settings</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 block">Default Temperature</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        value={settings.defaultTemperature}
                        onChange={(e) => setSettings({ ...settings, defaultTemperature: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 block">Job Concurrency Limit</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={settings.concurrencyLimit}
                        onChange={(e) => setSettings({ ...settings, concurrencyLimit: parseInt(e.target.value) || 1 })}
                        className="w-full bg-slate-950 border border-slate-800/80 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 font-mono transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800/60 flex justify-end">
                  <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md shadow-blue-600/10 opacity-80 cursor-not-allowed">
                    Save Config (🚧)
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
