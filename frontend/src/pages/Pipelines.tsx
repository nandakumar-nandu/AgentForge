"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Layers,
  Play,
  Edit,
  History,
  Trash2,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
  X
} from "lucide-react";
import io from "socket.io-client";
import PipelineBuilder from "../components/PipelineBuilder";

interface PipelineStep {
  order: number;
  agentId: {
    _id: string;
    name: string;
    type: string;
    model: string;
  } | string;
  inputSource: string;
  outputKey: string;
  transformPrompt?: string;
}

interface Pipeline {
  _id: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

interface StepResult {
  stepOrder: number;
  agentId: {
    _id: string;
    name: string;
  } | null;
  input: string;
  output: string;
  tokensUsed: number;
  costUSD: number;
  durationMs: number;
  status: "pending" | "running" | "completed" | "failed";
}

interface PipelineRun {
  _id: string;
  pipelineId: string;
  initialInput: string;
  stepResults: StepResult[];
  overallStatus: "running" | "completed" | "failed" | "cancelled";
  totalCostUSD: number;
  startedAt: string;
  completedAt?: string;
}

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Builder tab state
  const [builderActive, setBuilderActive] = useState<boolean>(false);
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null);

  // Runs history drawer state
  const [historyDrawerPipeline, setHistoryDrawerPipeline] = useState<Pipeline | null>(null);
  const [pastRuns, setPastRuns] = useState<PipelineRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState<boolean>(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Execution modal state
  const [executingPipeline, setExecutingPipeline] = useState<Pipeline | null>(null);
  const [initialInput, setInitialInput] = useState<string>("");
  const [submittingRun, setSubmittingRun] = useState<boolean>(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunDetails, setActiveRunDetails] = useState<PipelineRun | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

  // Helper fetching headers
  const getFetchOptions = useCallback((method = "GET", body: unknown = null) => {
    const token = localStorage.getItem("token") || "";
    return {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : null
    };
  }, []);

  // 1. Fetch pipelines list
  const fetchPipelines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/pipelines`, getFetchOptions());
      if (!res.ok) throw new Error(`Query failed: status ${res.status}`);
      const data = await res.json();
      setPipelines(data);
    } catch (err: unknown) {
      console.warn("Pipelines backend offline. Loading placeholder preview items.", err);
      setError("Backend service offline. Loading pipeline directory fallbacks.");
      // Fallback pipeline data for sandbox dashboard
      setPipelines([
        {
          _id: "pipe-1",
          name: "Structured Lead Summarizer",
          description: "Ingests raw FAQ answers, extracts actionable user leads, summaries profiling details, and translates the output.",
          steps: [
            { order: 1, agentId: "1", inputSource: "user_input", outputKey: "leads" },
            { order: 2, agentId: "2", inputSource: "leads", outputKey: "summary", transformPrompt: "Format the final bullets in French" }
          ],
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, getFetchOptions]);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  // Refresh active run details
  const refreshActiveRunDetails = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/pipelines/runs/${runId}`, getFetchOptions());
      if (res.ok) {
        const data = await res.json();
        setActiveRunDetails(data);
      }
    } catch (err) {
      console.error("Failed to query active run details:", err);
    }
  }, [backendUrl, getFetchOptions]);

  // Socket.io listeners for active pipeline runs updates
  useEffect(() => {
    if (!activeRunId) return;

    const socket = io(backendUrl);

    socket.on("connect", () => {
      console.log("[Socket.io] Subscribing to pipelines execution channels");
    });

    interface PipelineEventPayload {
      pipelineRunId: string;
    }

    // Listen for progress changes
    const handleStepStart = (data: PipelineEventPayload) => {
      if (data.pipelineRunId !== activeRunId) return;
      refreshActiveRunDetails(activeRunId);
    };

    const handleStepCompleted = (data: PipelineEventPayload) => {
      if (data.pipelineRunId !== activeRunId) return;
      refreshActiveRunDetails(activeRunId);
    };

    const handleStepFailed = (data: PipelineEventPayload) => {
      if (data.pipelineRunId !== activeRunId) return;
      refreshActiveRunDetails(activeRunId);
    };

    const handleCompleted = (data: PipelineEventPayload) => {
      if (data.pipelineRunId !== activeRunId) return;
      refreshActiveRunDetails(activeRunId);
    };

    socket.on("pipeline:stepStarted", handleStepStart);
    socket.on("pipeline:stepCompleted", handleStepCompleted);
    socket.on("pipeline:stepFailed", handleStepFailed);
    socket.on("pipeline:completed", handleCompleted);

    return () => {
      socket.off("pipeline:stepStarted", handleStepStart);
      socket.off("pipeline:stepCompleted", handleStepCompleted);
      socket.off("pipeline:stepFailed", handleStepFailed);
      socket.off("pipeline:completed", handleCompleted);
      socket.disconnect();
    };
  }, [activeRunId, backendUrl, refreshActiveRunDetails]);

  // Fetch runs list for a pipeline
  const fetchPipelineRuns = async (pipelineId: string) => {
    setLoadingRuns(true);
    try {
      const res = await fetch(`${backendUrl}/api/pipelines/${pipelineId}/runs`, getFetchOptions());
      if (res.ok) {
        const data = await res.json();
        setPastRuns(data);
      } else {
        setPastRuns([]);
      }
    } catch (err) {
      console.warn("Backend offline. Generating mock past runs listing.", err);
      setPastRuns([
        {
          _id: "run-simulated-1",
          pipelineId,
          initialInput: "Contact Info: Jane Doe, email: jane@doe.com, notes: interested in receptionist product.",
          stepResults: [
            {
              stepOrder: 1,
              agentId: { _id: "1", name: "Structured FAQ Extractor" },
              input: "Jane Doe, email: jane@doe.com...",
              output: "Name: Jane Doe\nEmail: jane@doe.com\nIntent: Product Interest",
              tokensUsed: 140,
              costUSD: 0.0009,
              durationMs: 950,
              status: "completed"
            }
          ],
          overallStatus: "completed",
          totalCostUSD: 0.0009,
          startedAt: new Date(Date.now() - 3600000).toISOString(),
          completedAt: new Date(Date.now() - 3599000).toISOString()
        }
      ]);
    } finally {
      setLoadingRuns(false);
    }
  };

  // Trigger Execution Request
  const handleExecutePipeline = async () => {
    if (!executingPipeline || !initialInput.trim()) return;
    setSubmittingRun(true);
    try {
      const res = await fetch(
        `${backendUrl}/api/pipelines/${executingPipeline._id}/run`,
        getFetchOptions("POST", { initialInput: initialInput.trim() })
      );
      if (!res.ok) throw new Error(`Trigger execution run failed`);
      const data = await res.json();

      setActiveRunId(data.pipelineRunId);
      // Hydrate initial mock details state to load UI frames
      setActiveRunDetails({
        _id: data.pipelineRunId,
        pipelineId: executingPipeline._id,
        initialInput: initialInput.trim(),
        stepResults: executingPipeline.steps.map(s => ({
          stepOrder: s.order,
          agentId: null,
          input: "",
          output: "",
          tokensUsed: 0,
          costUSD: 0,
          durationMs: 0,
          status: "pending"
        })),
        overallStatus: "running",
        totalCostUSD: 0,
        startedAt: new Date().toISOString()
      });

      // Clear run prompts
      setInitialInput("");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Server error";
      alert(`Failed to trigger execution: ${errMsg}`);
    } finally {
      setSubmittingRun(false);
    }
  };

  // Archive Pipeline Layout
  const handleDeletePipeline = async (id: string) => {
    if (!confirm("Are you sure you want to permanently archive this pipeline layout?")) return;
    try {
      const res = await fetch(`${backendUrl}/api/pipelines/${id}`, getFetchOptions("DELETE"));
      if (res.ok) {
        fetchPipelines();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Close Active run overlay
  const handleCloseActiveRunOverlay = () => {
    setActiveRunId(null);
    setActiveRunDetails(null);
    setExecutingPipeline(null);
    fetchPipelines();
  };

  // Render the Builder component if active
  if (builderActive) {
    return (
      <PipelineBuilder
        pipelineId={editingPipelineId}
        onBack={() => { setBuilderActive(false); setEditingPipelineId(null); }}
        onSaveSuccess={() => { setBuilderActive(false); setEditingPipelineId(null); fetchPipelines(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-905 p-4 rounded-xl border border-slate-900">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2 text-white">
            <Layers className="w-5 h-5 text-blue-500" /> Multi-Agent Pipelines
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            Build execution chains where output results are automatically fed as inputs to subsequent agents.
          </p>
        </div>
        <div>
          <button
            onClick={() => { setEditingPipelineId(null); setBuilderActive(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all shadow-md shadow-blue-600/10"
          >
            <Plus className="w-4 h-4" /> New Pipeline
          </button>
        </div>
      </div>

      {/* Offline Alert Warning */}
      {error && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Pipelines directory grid */}
      {loading ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="text-slate-500 text-xs font-mono">Fetching pipelines index...</span>
        </div>
      ) : pipelines.length === 0 ? (
        <div className="p-12 text-center bg-slate-950/40 border border-slate-900 rounded-2xl space-y-3">
          <Layers className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="font-bold text-slate-300">No pipelines created yet</h4>
          <p className="text-slate-500 text-xs max-w-xs mx-auto">
            Get started by assembling your first pipeline to orchestrate multi-step agent completions.
          </p>
          <button
            onClick={() => { setEditingPipelineId(null); setBuilderActive(true); }}
            className="bg-slate-950 border border-slate-800 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-xs transition-colors"
          >
            Open Pipeline Builder
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pipelines.map((pipeline) => (
            <div
              key={pipeline._id}
              className="bg-slate-950/40 border border-slate-900 rounded-2xl p-6 flex flex-col justify-between hover:border-slate-800/80 transition-all duration-200"
            >
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-slate-100">{pipeline.name}</h4>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {pipeline.steps.length} Steps
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed min-h-[40px]">
                  {pipeline.description || "No description provided."}
                </p>
              </div>

              {/* Bottom actions control row */}
              <div className="pt-5 mt-5 border-t border-slate-900/60 flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={() => { setExecutingPipeline(pipeline); setInitialInput(""); }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" /> Run
                  </button>
                  <button
                    onClick={() => { setEditingPipelineId(pipeline._id); setBuilderActive(true); }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white border border-slate-800 transition-all"
                  >
                    <Edit className="w-3.5 h-3.5" /> Edit
                  </button>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => { setHistoryDrawerPipeline(pipeline); fetchPipelineRuns(pipeline._id); }}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-colors"
                    title="View execution runs history log"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePipeline(pipeline._id)}
                    className="p-1.5 text-rose-500 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition-colors"
                    title="Delete pipeline layout"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Execution Prompt Modal overlay */}
      {executingPipeline && !activeRunId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Play className="w-5 h-5 text-blue-500 fill-blue-500" /> Execute: {executingPipeline.name}
              </h3>
              <button
                onClick={() => setExecutingPipeline(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">Initial Pipeline Prompt Input</label>
              <textarea
                value={initialInput}
                onChange={(e) => setInitialInput(e.target.value)}
                placeholder="Enter variables or raw prompt parameters to seed step 1 execution..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-blue-500 h-32 resize-none"
              />
              <p className="text-[10px] text-slate-500">
                This prompt will populate the <code className="text-slate-400">user_input</code> parameter context for step actions.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800/60">
              <button
                onClick={() => setExecutingPipeline(null)}
                className="px-4 py-2 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-xs bg-slate-950 hover:bg-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecutePipeline}
                disabled={submittingRun || !initialInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors shadow-md shadow-blue-600/10"
              >
                {submittingRun ? "Starting..." : "Start Pipeline"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Active Run progress tracker overlay */}
      {activeRunDetails && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center pb-4 border-b border-slate-850">
              <div>
                <h3 className="font-bold text-white text-lg">Execution Run Progress</h3>
                <span className="text-[10px] text-slate-500 font-mono">Run ID: {activeRunDetails._id}</span>
              </div>
              
              {activeRunDetails.overallStatus !== "running" && (
                <button
                  onClick={handleCloseActiveRunOverlay}
                  className="text-slate-400 hover:text-white p-1 bg-slate-950 border border-slate-800 hover:bg-slate-900 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Overall status parameters */}
            <div className="flex items-center justify-between p-4 bg-slate-950/60 border border-slate-850 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  {activeRunDetails.overallStatus === "running" ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                    </>
                  ) : activeRunDetails.overallStatus === "completed" ? (
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  ) : (
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  )}
                </span>
                <div>
                  <span className="text-slate-400 text-xs font-semibold block">Overall Status</span>
                  <span className="text-[10px] font-mono uppercase text-slate-300 font-bold">{activeRunDetails.overallStatus}</span>
                </div>
              </div>

              <div className="flex gap-5 text-right font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Spend</span>
                  <span className="text-xs font-bold text-emerald-400">${activeRunDetails.totalCostUSD.toFixed(6)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Started At</span>
                  <span className="text-xs text-slate-400">{new Date(activeRunDetails.startedAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            {/* Sequence steps timeline */}
            <div className="space-y-4">
              <h4 className="font-bold text-slate-300 text-sm">Chaining Process Step Progress</h4>
              
              <div className="space-y-3">
                {activeRunDetails.stepResults.map((result, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-slate-950/40 border border-slate-850/80 rounded-xl space-y-3"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded text-[10px] font-bold font-mono flex items-center justify-center ${
                          result.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : result.status === "failed" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : result.status === "running" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-slate-800 text-slate-400"
                        }`}>
                          {result.stepOrder}
                        </span>
                        <span className="text-xs font-bold text-slate-300">
                          Step {result.stepOrder} Actions
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {result.status === "running" && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-blue-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> In Progress
                          </div>
                        )}
                        {result.status === "completed" && (
                          <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Success
                          </div>
                        )}
                        {result.status === "failed" && (
                          <div className="flex items-center gap-1 text-[10px] font-mono text-rose-400">
                            <XCircle className="w-3.5 h-3.5" /> Error
                          </div>
                        )}
                        {result.status === "pending" && (
                          <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">Pending</span>
                        )}
                      </div>
                    </div>

                    {/* Display input/output text context */}
                    {result.status !== "pending" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px] font-mono">
                        <div className="space-y-1.5 p-3 bg-slate-950/80 border border-slate-900 rounded-lg">
                          <span className="text-slate-500 block uppercase text-[9px] font-bold">Step Input:</span>
                          <p className="text-slate-300 whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">{result.input}</p>
                        </div>

                        <div className="space-y-1.5 p-3 bg-slate-950/80 border border-slate-900 rounded-lg">
                          <span className="text-slate-500 block uppercase text-[9px] font-bold">Step Output:</span>
                          <p className="text-slate-300 whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
                            {result.output || "Resolving output payload..."}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Cost allocation metrics */}
                    {result.status === "completed" && (
                      <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono pt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-600" /> Duration: {(result.durationMs / 1000).toFixed(2)}s
                        </span>
                        <span className="flex items-center gap-1 text-emerald-500/80">
                          <DollarSign className="w-3 h-3" /> Cost: ${result.costUSD.toFixed(6)}
                        </span>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </div>

            {/* Bottom button controls */}
            {activeRunDetails.overallStatus !== "running" && (
              <div className="flex justify-end pt-2 border-t border-slate-805">
                <button
                  onClick={handleCloseActiveRunOverlay}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2.5 rounded-lg transition-colors"
                >
                  Return to Dashboard
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Past Runs History Drawer */}
      {historyDrawerPipeline && (
        <div className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex justify-end">
          <div className="bg-slate-900 border-l border-slate-800 w-full max-w-2xl p-6 shadow-2xl h-screen flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-250">
            
            <div className="space-y-6 flex-1">
              <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                <div>
                  <h3 className="font-bold text-white text-lg">Past Execution Logs</h3>
                  <span className="text-[10px] text-slate-400 block font-sans">Pipeline: {historyDrawerPipeline.name}</span>
                </div>
                <button
                  onClick={() => setHistoryDrawerPipeline(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {loadingRuns ? (
                <div className="h-48 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  <span className="text-slate-500 text-xs font-mono">Loading runs history...</span>
                </div>
              ) : pastRuns.length === 0 ? (
                <div className="text-center py-12 text-slate-500 font-mono text-xs">
                  No execution runs found for this pipeline.
                </div>
              ) : (
                <div className="space-y-4">
                  {pastRuns.map((run) => {
                    const isExpanded = expandedRunId === run._id;
                    return (
                      <div
                        key={run._id}
                        className="bg-slate-950/40 border border-slate-850 rounded-xl overflow-hidden"
                      >
                        {/* Header summary button */}
                        <button
                          onClick={() => setExpandedRunId(isExpanded ? null : run._id)}
                          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-950/20 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              run.overallStatus === "completed" ? "bg-emerald-500" : run.overallStatus === "failed" ? "bg-rose-500" : "bg-blue-500"
                            }`} />
                            <div>
                              <span className="text-xs font-bold text-slate-300 block font-mono">
                                Run: {run._id.substring(run._id.length - 8)}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(run.startedAt).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right text-[10px] text-slate-400 font-mono">
                              <span className="block text-emerald-400 font-bold">${run.totalCostUSD.toFixed(5)}</span>
                              <span>{run.stepResults.filter(s => s.status === 'completed').length} / {run.stepResults.length} Steps</span>
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                          </div>
                        </button>

                        {/* Collapsible Steps list details */}
                        {isExpanded && (
                          <div className="p-4 border-t border-slate-900 bg-slate-950/20 space-y-4">
                            <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg text-[11px] font-mono">
                              <span className="text-slate-500 block uppercase text-[9px] font-bold">Initial Entry Prompt Input:</span>
                              <p className="text-slate-300 whitespace-pre-wrap">{run.initialInput}</p>
                            </div>

                            <div className="space-y-3">
                              {run.stepResults.map((s, sidx) => (
                                <div
                                  key={sidx}
                                  className="p-3 bg-slate-950/80 border border-slate-900 rounded-lg space-y-2 text-[11px] font-mono"
                                >
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-300">
                                      Step {s.stepOrder} Output ({s.agentId ? s.agentId.name : "Agent"}):
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                      s.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                    }`}>
                                      {s.status}
                                    </span>
                                  </div>
                                  <p className="text-slate-400 whitespace-pre-wrap leading-relaxed">{s.output || "No output resolved."}</p>
                                  {s.status === 'completed' && (
                                    <div className="flex justify-between text-[9px] text-slate-500 pt-1">
                                      <span>Duration: {(s.durationMs / 1000).toFixed(2)}s</span>
                                      <span className="text-emerald-500/80">Cost: ${s.costUSD.toFixed(6)}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}

            </div>

            <div className="pt-4 border-t border-slate-800/60 flex justify-end">
              <button
                onClick={() => setHistoryDrawerPipeline(null)}
                className="px-4 py-2 border border-slate-850 hover:border-slate-800 text-slate-400 hover:text-white rounded-lg text-xs bg-slate-950 hover:bg-slate-900 transition-colors"
              >
                Close History
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
