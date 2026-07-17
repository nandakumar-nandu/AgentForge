"use client";

import React, { useState, useEffect } from "react";
import {
  Bot,
  Plus,
  Play,
  Trash2,
  Edit,
  X,
  Loader2,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Cpu,
  HelpCircle
} from "lucide-react";
import AgentChat from "./AgentChat";

// Local TypeScript definitions for frontend UI (matches backend model)
export interface Agent {
  _id?: string;
  name: string;
  type: "receptionist" | "testimonial" | "qa" | "custom";
  systemPrompt: string;
  model: "gpt-4o" | "claude-3-5-sonnet";
  status: "active" | "inactive";
  createdAt?: string;
}

// Resilient fallback mock data when database/API is offline
const FALLBACK_AGENTS: Agent[] = [
  {
    _id: "agent-fallback-1",
    name: "FrontDesk-Bot",
    type: "receptionist",
    systemPrompt: "You are a polite virtual receptionist. Greet users, collect their inquiries, and route them.",
    model: "claude-3-5-sonnet",
    status: "active",
    createdAt: new Date().toISOString()
  },
  {
    _id: "agent-fallback-2",
    name: "FeedbackSummarizer",
    type: "testimonial",
    systemPrompt: "Analyze customer review transcripts and extract structured positive feedback and pain points.",
    model: "gpt-4o",
    status: "active",
    createdAt: new Date().toISOString()
  },
  {
    _id: "agent-fallback-3",
    name: "E2E-Tester",
    type: "qa",
    systemPrompt: "You are a QA automation model. Inspect user stories and output valid JSON Playwright scripts.",
    model: "gpt-4o",
    status: "inactive",
    createdAt: new Date().toISOString()
  }
];

export interface AgentsPageProps {
  selectedTemplate?: {
    name: string;
    type: "receptionist" | "testimonial" | "qa" | "custom";
    systemPrompt: string;
    model?: "gpt-4o" | "claude-3-5-sonnet";
  } | null;
  onClearTemplate?: () => void;
}

export default function AgentsPage({ selectedTemplate, onClearTemplate }: AgentsPageProps = {}) {
  // Agent states
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallbacks, setUsingFallbacks] = useState<boolean>(false);

  // Prefill the agent creation form when a template is selected from templates dashboard
  useEffect(() => {
    if (selectedTemplate) {
      setFormName(`My-${selectedTemplate.name}`);
      setFormType(selectedTemplate.type);
      setFormPrompt(selectedTemplate.systemPrompt);
      setFormModel(selectedTemplate.model || "gpt-4o");
      setEditingAgent(null);
      setIsModalOpen(true);
      if (onClearTemplate) {
        onClearTemplate();
      }
    }
  }, [selectedTemplate, onClearTemplate]);

  // Modal control states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  // Active chat state
  const [activeAgentForChat, setActiveAgentForChat] = useState<Agent | null>(null);

  // Form states
  const [formName, setFormName] = useState<string>("");
  const [formType, setFormType] = useState<"receptionist" | "testimonial" | "qa" | "custom">("custom");
  const [formModel, setFormModel] = useState<"gpt-4o" | "claude-3-5-sonnet">("gpt-4o");
  const [formPrompt, setFormPrompt] = useState<string>("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

  // Fetch agents from Mongoose API
  const fetchAgents = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setUsingFallbacks(false);
    try {
      const res = await fetch(`${backendUrl}/api/agents`);
      if (!res.ok) {
        throw new Error(`API returned status ${res.status}`);
      }
      const data = await res.json();
      setAgents(data);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to connect to backend";
      console.warn("Could not retrieve agents from backend. Falling back to local mocks.", errMsg);
      setAgents(FALLBACK_AGENTS);
      setUsingFallbacks(true);
      setError("Backend connection offline. Using local placeholder agents.");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Open modal for creation
  const handleOpenCreateModal = () => {
    setEditingAgent(null);
    setFormName("");
    setFormType("custom");
    setFormModel("gpt-4o");
    setFormPrompt("");
    setFormStatus("active");
    setValidationErrors([]);
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEditModal = (agent: Agent) => {
    setEditingAgent(agent);
    setFormName(agent.name);
    setFormType(agent.type);
    setFormModel(agent.model);
    setFormPrompt(agent.systemPrompt);
    setFormStatus(agent.status);
    setValidationErrors([]);
    setIsModalOpen(true);
  };

  // Submit form (Create / Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);

    // Client-side validations
    const errors = [];
    if (!formName.trim()) errors.push("Agent name is required");
    if (!formPrompt.trim()) errors.push("System prompt guidelines are required");
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    const payload: Omit<Agent, "createdAt"> = {
      name: formName.trim(),
      type: formType,
      model: formModel,
      systemPrompt: formPrompt.trim(),
      status: formStatus
    };

    setSubmitting(true);

    try {
      if (usingFallbacks) {
        // Handle mock updates in UI state if server is offline
        if (editingAgent) {
          setAgents(agents.map(a => a._id === editingAgent._id ? { ...a, ...payload } : a));
        } else {
          const mockNew: Agent = {
            ...payload,
            _id: `agent-mock-${Date.now()}`,
            createdAt: new Date().toISOString()
          };
          setAgents([mockNew, ...agents]);
        }
        setIsModalOpen(false);
      } else {
        // Dispatch live REST fetch calls
        const url = editingAgent 
          ? `${backendUrl}/api/agents/${editingAgent._id}` 
          : `${backendUrl}/api/agents`;
        const method = editingAgent ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || `Server returned error status ${res.status}`);
        }

        // Refresh UI state
        await fetchAgents();
        setIsModalOpen(false);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to commit changes to backend database";
      setValidationErrors([errMsg]);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle deletion
  const handleDelete = async (id: string | undefined) => {
    if (!id) return;
    if (!confirm("Are you sure you want to delete this agent? This action is permanent.")) return;

    try {
      if (usingFallbacks) {
        setAgents(agents.filter(a => a._id !== id));
      } else {
        const res = await fetch(`${backendUrl}/api/agents/${id}`, {
          method: "DELETE"
        });
        if (!res.ok) {
          throw new Error(`Delete request failed with status ${res.status}`);
        }
        await fetchAgents();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Delete request failed";
      alert(`Error deleting agent: ${errMsg}`);
    }
  };

  // Helper styles for agent types
  const getTypeBadgeStyles = (type: string) => {
    switch (type) {
      case "receptionist":
        return "bg-teal-500/10 text-teal-400 border border-teal-500/20";
      case "testimonial":
        return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
      case "qa":
        return "bg-pink-500/10 text-pink-400 border border-pink-500/20";
      default:
        return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
    }
  };

  if (activeAgentForChat) {
    return (
      <AgentChat
        agentId={activeAgentForChat._id!}
        agentName={activeAgentForChat.name}
        model={activeAgentForChat.model}
        onBack={() => setActiveAgentForChat(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Header Section */}
      <div className="flex justify-between items-center bg-slate-900/20 p-4 rounded-xl border border-slate-900">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2 text-white">
            <Bot className="w-5 h-5 text-blue-500" /> Agents Directory
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            Build, edit, and orchestrate custom models tailored for customer relations, reviews, QA, or custom execution paths.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAgents}
            className="flex items-center justify-center p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
            title="Refresh database records"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-blue-500/10"
          >
            <Plus className="w-4 h-4" /> New Agent
          </button>
        </div>
      </div>

      {/* Backend Disconnected Notice */}
      {usingFallbacks && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-amber-400">Database Connection Warning</p>
            <p className="text-slate-400 mt-1">
              {error || `Unable to establish handshake with API server on ${backendUrl}. Running UI updates in local mock mode.`}
            </p>
          </div>
        </div>
      )}

      {/* Main Agent Cards List */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <span className="text-slate-500 text-sm font-mono">Querying database nodes...</span>
        </div>
      ) : agents.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <Bot className="w-12 h-12 text-slate-700 mx-auto" />
          <h4 className="font-bold text-slate-300">No Agents Configured</h4>
          <p className="text-slate-500 text-xs max-w-sm mx-auto">
            You don&apos;t have any AI agents in your database. Click the &quot;New Agent&quot; button above to deploy your first model.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <div
              key={agent._id}
              className={`bg-slate-900/40 border rounded-2xl flex flex-col justify-between transition-all hover:translate-y-[-2px] hover:shadow-lg ${
                agent.status === "active" ? "border-slate-800 hover:border-slate-700" : "border-slate-900 opacity-60 hover:opacity-80"
              }`}
            >
              <div className="p-6 space-y-4">
                
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-slate-100 group-hover:text-blue-400">{agent.name}</h4>
                    <span className="text-[10px] text-slate-500 block font-mono mt-1">ID: {agent._id}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide font-mono ${getTypeBadgeStyles(agent.type)}`}>
                    {agent.type}
                  </span>
                </div>

                {/* Model and status badges */}
                <div className="flex gap-2 text-[10px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-slate-950/60 border border-slate-800 text-slate-400 flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-cyan-500" /> {agent.model}
                  </span>
                  <span className={`px-2 py-0.5 rounded flex items-center gap-1 ${
                    agent.status === "active" 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                      : "bg-slate-800 text-slate-500 border border-slate-700"
                  }`}>
                    {agent.status === "active" ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Prompt instructions */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">System Prompt Guidelines</span>
                  <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-900 text-xs font-mono text-slate-400 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                    {agent.systemPrompt}
                  </div>
                </div>

              </div>

              {/* Action Buttons */}
              <div className="border-t border-slate-800 bg-slate-900/20 p-4 flex justify-between items-center">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleOpenEditModal(agent)}
                    className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    title="Edit configurations"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(agent._id)}
                    className="p-2 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 transition-colors"
                    title="Delete Agent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                {/* Chat and Run Action Buttons (Unwired) */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveAgentForChat(agent)}
                    className="px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                    title="Interactive test chat interface"
                  >
                    Chat
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition-colors flex items-center gap-1 cursor-not-allowed opacity-80"
                    title="Queue agent test job (🚧)"
                  >
                    <Play className="w-3 h-3 fill-white" /> Run
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Creation / Update Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                {editingAgent ? "Modify Agent Configuration" : "Configure New Agent"}
              </h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              
              {/* Validation notification warnings */}
              {validationErrors.length > 0 && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-lg space-y-1">
                  {validationErrors.map((err, idx) => (
                    <div key={idx} className="flex gap-2 items-center text-xs text-rose-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Name field */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 block">Agent Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TestimonialBot-V1"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Type selection dropdown */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 block">Orchestrator Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as "receptionist" | "testimonial" | "qa" | "custom")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="receptionist">Receptionist (Greetings)</option>
                    <option value="testimonial">Testimonial (Reviews)</option>
                    <option value="qa">QA Automated Tester</option>
                    <option value="custom">Custom Pipeline</option>
                  </select>
                </div>

                {/* Model selection dropdown */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-400 block">LLM Engine</label>
                  <select
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value as "gpt-4o" | "claude-3-5-sonnet")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="gpt-4o">GPT-4o (OpenAI)</option>
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  </select>
                </div>
              </div>

              {/* Status active selection */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400 block">Operational Status</label>
                <div className="flex gap-4">
                  {[
                    { val: "active", label: "Active" },
                    { val: "inactive", label: "Inactive" }
                  ].map((statOpt) => (
                    <label key={statOpt.val} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        value={statOpt.val}
                        checked={formStatus === statOpt.val}
                        onChange={() => setFormStatus(statOpt.val as "active" | "inactive")}
                        className="accent-blue-500"
                      />
                      <span>{statOpt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* System prompt guidelines */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-slate-400">System Instructions Guidelines</label>
                  <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                    Supports variable bindings <HelpCircle className="w-2.5 h-2.5" />
                  </span>
                </div>
                <textarea
                  required
                  rows={4}
                  placeholder="You are an AI assistant configured to..."
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-sm text-slate-300 focus:outline-none focus:border-blue-500 font-mono transition-colors resize-none"
                />
              </div>

              {/* Action operations buttons */}
              <div className="pt-4 border-t border-slate-800/80 flex justify-end gap-2 bg-slate-900/20 -mx-6 -mb-6 p-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-800 text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white rounded-lg transition-colors flex items-center gap-2 shadow-md shadow-blue-500/10"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingAgent ? "Save Changes" : "Deploy Agent"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
