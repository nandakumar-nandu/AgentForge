/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  XCircle,
  RotateCcw,
  CheckCircle2,
  AlertOctagon,
  Loader2,
  Activity,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  RefreshCw,
  HelpCircle
} from "lucide-react";
import { Job } from "@agentforge/shared";
import { useJobSocket } from "../hooks/useJobSocket";

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

  // Socket.io integration to automatically update job status, progress, and results in real-time
  const { watchJob } = useJobSocket(jobs, setJobs);

  /**
   * Fetch all batch job logs from backend MongoDB database
   */
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/jobs`);
      if (!res.ok) {
        throw new Error(`Server returned error status ${res.status}`);
      }
      const data = await res.json();
      // Ensure all jobs have a progress property for safe UI rendering
      const cleanedData = data.map((j: any) => ({
        ...j,
        id: j._id || j.id, // Support MongoDB Object ID mapping to type property
        progress: j.progress !== undefined ? j.progress : (j.status === 'completed' ? 100 : 0)
      }));
      setJobs(cleanedData);
    } catch (err: any) {
      console.error("Failed to load jobs list from server:", err);
      setError("Failed to sync with job service. Operating in offline viewer mode.");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  /**
   * Action Handler: Pause job execution mid-flight
   */
  const handlePauseJob = async (jobId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/jobs/${jobId}/pause`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Failed to pause job`);
      }
      // Update local state immediately (Socket.io event will also broadcast this update)
      setJobs((prev) =>
        prev.map((job) => (job.id === jobId ? { ...job, status: "paused" as any } : job))
      );
    } catch (err: any) {
      alert(`Error pausing job: ${err.message}`);
    }
  };

  /**
   * Action Handler: Resume paused job execution
   */
  const handleResumeJob = async (jobId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/jobs/${jobId}/resume`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Failed to resume job`);
      }
      // Update local state immediately
      setJobs((prev) =>
        prev.map((job) => (job.id === jobId ? { ...job, status: "active" } : job))
      );
    } catch (err: any) {
      alert(`Error resuming job: ${err.message}`);
    }
  };

  /**
   * Action Handler: Cancel pending or running batch job
   */
  const handleCancelJob = async (jobId: string) => {
    if (!confirm("Are you sure you want to cancel this background batch run?")) return;
    try {
      const res = await fetch(`${backendUrl}/api/jobs/${jobId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Failed to cancel job`);
      }
      // Update local state immediately
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? { ...job, status: "failed", error: "Cancelled by user", completedAt: new Date().toISOString() }
            : job
        )
      );
    } catch (err: any) {
      alert(`Error cancelling job: ${err.message}`);
    }
  };

  /**
   * Action Handler: Retry failed or cancelled job
   */
  const handleRetryJob = async (jobId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/jobs/${jobId}/retry`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `Failed to retry job`);
      }
      const data = await res.json();
      const updatedJob = {
        ...data.job,
        id: data.job._id || data.job.id,
        progress: 0
      };
      
      // Update state and register to listen for events from the newly queued BullMQ task room
      setJobs((prev) => prev.map((job) => (job.id === jobId ? updatedJob : job)));
      watchJob(updatedJob.id);
    } catch (err: any) {
      alert(`Error retrying job: ${err.message}`);
    }
  };

  // Helper: Extract agent metadata from populated agentId fields
  const getAgentDetails = (job: any) => {
    if (job.agentId && typeof job.agentId === "object") {
      return {
        name: job.agentId.name || "Unknown Agent",
        model: job.agentId.model || "gpt-4o"
      };
    }
    return {
      name: "Agent ID: " + String(job.agentId).substring(0, 8) + "...",
      model: "Unknown"
    };
  };

  // Helper: Calculate queue index position dynamically for pending jobs
  const getQueuePosition = (jobId: string) => {
    const pendingJobs = jobs
      .filter((j) => j.status === "pending")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const positionIndex = pendingJobs.findIndex((j) => j.id === jobId);
    return positionIndex !== -1 ? positionIndex + 1 : 1;
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Controls Bar */}
      <div className="flex justify-between items-center bg-slate-900/20 p-4 rounded-xl border border-slate-900">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2 text-white">
            <Activity className="w-5 h-5 text-blue-500 animate-pulse" /> BullMQ Job Queue
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            Real-time status updates and execution controls of batch agent tasks.
          </p>
        </div>
        <button
          onClick={fetchJobs}
          disabled={loading}
          className="flex items-center gap-1.5 border border-slate-800 text-slate-300 hover:text-white bg-slate-950/40 hover:bg-slate-900 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wider uppercase transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Queue
        </button>
      </div>

      {/* Connection Offline Notice */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 shrink-0 animate-bounce" />
          <span>{error}</span>
        </div>
      )}

      {loading && jobs.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3 bg-slate-950/20 border border-slate-950 rounded-2xl">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <span className="text-slate-500 text-xs font-mono">Syncing execution schedules...</span>
        </div>
      ) : jobs.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center gap-2 bg-slate-950/20 border border-slate-950 rounded-2xl text-center p-6">
          <HelpCircle className="w-10 h-10 text-slate-600 mb-1" />
          <h4 className="text-slate-300 font-bold text-sm">No Batch Run Logs Found</h4>
          <p className="text-slate-500 text-xs max-w-sm">
            Jobs will appear here once you trigger query batch requests via the REST API or Agent configurations.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {jobs.map((job) => {
            const { name: agentName, model: agentModel } = getAgentDetails(job);
            const isPending = job.status === "pending";
            const isActive = job.status === "active";
            const isPaused = (job.status as string) === "paused";
            const isCompleted = job.status === "completed";
            const isFailed = job.status === "failed";
            
            const resultsCount = job.results ? job.results.length : 0;
            const inputsCount = job.inputData ? job.inputData.length : 0;
            const progressVal = job.progress !== undefined ? job.progress : 0;

            return (
              <div
                key={job.id}
                className={`bg-slate-950/40 border rounded-2xl overflow-hidden transition-all duration-200 ${
                  isActive ? "border-cyan-500/30 shadow-md shadow-cyan-500/5 bg-slate-900/10" :
                  isPaused ? "border-amber-500/20 shadow-md bg-slate-900/5" :
                  isCompleted ? "border-slate-800/80 hover:border-slate-800" :
                  isFailed ? "border-red-950/60 hover:border-red-950" :
                  "border-slate-900 bg-slate-950/20"
                }`}
              >
                {/* Job Card Header Info */}
                <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-500 font-mono font-bold tracking-wider uppercase bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        ID: {String(job.id).slice(-8)}
                      </span>
                      <h4 className="font-bold text-slate-200 text-sm font-sans flex items-center gap-1.5">
                        {agentName}
                      </h4>
                      <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-slate-600" /> {agentModel}
                      </span>
                    </div>
                    
                    <div className="text-[11px] text-slate-400 flex items-center gap-4">
                      <span>Batch Size: <strong className="text-slate-300 font-semibold">{inputsCount} queries</strong></span>
                      <span className="text-slate-600">|</span>
                      <span>Created: <strong className="text-slate-500">{new Date(job.createdAt).toLocaleTimeString()}</strong></span>
                    </div>
                  </div>

                  {/* Right: Status and Control Actions */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    
                    {/* Status Badge */}
                    <span
                      className={`px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider border ${
                        isCompleted ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                        isActive ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse" :
                        isPaused ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                        isFailed ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        "bg-slate-900 text-slate-400 border-slate-800"
                      }`}
                    >
                      {job.status}
                    </span>

                    {/* Operational Actions */}
                    <div className="flex items-center gap-1.5 border border-slate-900/60 bg-slate-950/60 p-1.5 rounded-xl">
                      {/* Pause / Resume buttons */}
                      {isActive && (
                        <button
                          onClick={() => handlePauseJob(job.id)}
                          className="p-2 rounded-lg bg-slate-900 text-amber-400 hover:text-white hover:bg-amber-500/10 transition-colors"
                          title="Pause job processing"
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isPaused && (
                        <button
                          onClick={() => handleResumeJob(job.id)}
                          className="p-2 rounded-lg bg-slate-900 text-emerald-400 hover:text-white hover:bg-emerald-500/10 transition-colors"
                          title="Resume job processing"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Cancel button */}
                      {(isPending || isActive || isPaused) && (
                        <button
                          onClick={() => handleCancelJob(job.id)}
                          className="p-2 rounded-lg bg-slate-900 text-red-400 hover:text-white hover:bg-red-500/10 transition-colors"
                          title="Cancel/Abort execution run"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Retry button */}
                      {isFailed && (
                        <button
                          onClick={() => handleRetryJob(job.id)}
                          className="p-2 rounded-lg bg-slate-900 text-cyan-400 hover:text-white hover:bg-cyan-500/10 transition-colors"
                          title="Retry failed batch run"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Export results buttons */}
                      {isCompleted && (
                        <>
                          <a
                            href={`${backendUrl}/api/jobs/${job.id}/export?format=json`}
                            download
                            className="px-2 py-1 rounded-lg bg-slate-900 text-cyan-400 hover:text-white hover:bg-cyan-500/10 transition-colors flex items-center justify-center font-mono text-[9px] font-bold"
                            title="Export results as JSON"
                          >
                            JSON
                          </a>
                          <a
                            href={`${backendUrl}/api/jobs/${job.id}/export?format=csv`}
                            download
                            className="px-2 py-1 rounded-lg bg-slate-900 text-emerald-400 hover:text-white hover:bg-emerald-500/10 transition-colors flex items-center justify-center font-mono text-[9px] font-bold"
                            title="Export results as CSV"
                          >
                            CSV
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar container (Active / Paused) */}
                {(isActive || isPaused || (isPending && progressVal > 0)) && (
                  <div className="px-5 pb-4 space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 text-cyan-500 animate-spin" />
                        Processed {resultsCount} of {inputsCount} items
                      </span>
                      <span>{progressVal}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          isPaused ? "bg-amber-500 animate-pulse" : "bg-cyan-500"
                        }`}
                        style={{ width: `${progressVal}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Queue position notice (Pending) */}
                {isPending && progressVal === 0 && (
                  <div className="px-5 pb-4 flex items-center gap-2">
                    <div className="px-2 py-0.5 bg-slate-900 text-slate-400 border border-slate-800 rounded text-[10px] font-mono">
                      Queue Position: #{getQueuePosition(job.id)}
                    </div>
                    <span className="text-[10px] text-slate-500 font-sans italic">
                      Waiting for available background worker threads...
                    </span>
                  </div>
                )}

                {/* Failure error message details */}
                {isFailed && job.error && (
                  <div className="mx-5 mb-5 p-3 bg-red-950/20 border border-red-900/10 rounded-xl flex items-start gap-2">
                    <AlertOctagon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <h5 className="text-[11px] font-bold text-red-400 font-sans uppercase">Failure Exception</h5>
                      <p className="text-[10px] font-mono text-red-300/80 leading-relaxed">{job.error}</p>
                    </div>
                  </div>
                )}

                {/* Expandable drawer for completed answers */}
                {isCompleted && (
                  <div className="border-t border-slate-900 bg-slate-950/30">
                    <button
                      onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                      className="w-full px-5 py-3 flex justify-between items-center text-[10px] text-slate-400 hover:text-white transition-colors uppercase font-bold tracking-wider font-mono"
                    >
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        View Batch Execution Results ({resultsCount})
                      </span>
                      {expandedJobId === job.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {expandedJobId === job.id && (
                      <div className="p-5 border-t border-slate-900/60 space-y-4 max-h-96 overflow-y-auto bg-slate-950/60 divide-y divide-slate-900">
                        {job.inputData.map((query: string, queryIdx: number) => {
                          const answer = job.results && job.results[queryIdx];
                          return (
                            <div key={queryIdx} className={`pt-3 first:pt-0 space-y-2`}>
                              <div className="flex gap-2.5 items-start">
                                <span className="text-[9px] font-bold font-mono text-blue-400 shrink-0 bg-blue-500/10 px-1.5 py-0.5 rounded uppercase mt-0.5">
                                  Query #{queryIdx + 1}
                                </span>
                                <p className="text-xs text-slate-300 font-sans leading-relaxed">{query}</p>
                              </div>
                              <div className="flex gap-2.5 items-start bg-slate-900/40 p-3 rounded-xl border border-slate-900">
                                <span className="text-[9px] font-bold font-mono text-emerald-400 shrink-0 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase mt-0.5">
                                  Output
                                </span>
                                <p className="text-xs text-slate-200 font-sans leading-relaxed whitespace-pre-wrap">
                                  {answer || <span className="text-slate-600 italic">No output recorded.</span>}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
