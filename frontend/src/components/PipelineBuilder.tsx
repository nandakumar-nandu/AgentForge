"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  GripVertical,
  Layers,
  Settings,
  HelpCircle
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Agent {
  _id: string;
  name: string;
  type: string;
  model: string;
}

interface StepItem {
  id: string; // for dnd-kit sortable tracking
  order: number;
  agentId: string;
  inputSource: "user_input" | string; // previous step key or initial input
  outputKey: string;
  transformPrompt: string;
}

interface PipelineBuilderProps {
  pipelineId?: string | null;
  onBack: () => void;
  onSaveSuccess: () => void;
}

// ----------------------------------------------------------------------------
// Sortable Step Item Component
// ----------------------------------------------------------------------------
interface SortableStepProps {
  step: StepItem;
  index: number;
  agents: Agent[];
  allSteps: StepItem[];
  onChange: (id: string, updated: Partial<StepItem>) => void;
  onDelete: (id: string) => void;
}

function SortableStep({
  step,
  index,
  agents,
  allSteps,
  onChange,
  onDelete
}: SortableStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1
  };

  // Compile list of possible output keys from all steps preceding the current order
  const validPreviousKeys = allSteps
    .filter((s) => s.order < step.order)
    .map((s) => s.outputKey)
    .filter((k) => k && k.trim() !== "");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-slate-950/60 border ${
        isDragging ? "border-blue-500 bg-slate-900" : "border-slate-800/80"
      } rounded-xl p-5 space-y-4 hover:border-slate-800 transition-all duration-200`}
    >
      
      {/* Step Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-900">
        <div className="flex items-center gap-3">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-900 rounded-lg cursor-grab active:cursor-grabbing transition-colors"
            title="Drag to reorder step"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs font-bold font-mono flex items-center justify-center">
              {index + 1}
            </span>
            <h4 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Step Action</h4>
          </div>
        </div>

        <button
          onClick={() => onDelete(step.id)}
          className="p-1.5 text-rose-500/80 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition-all"
          title="Delete step"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Agent Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Agent Persona</label>
          <select
            value={step.agentId}
            onChange={(e) => onChange(step.id, { agentId: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="">Select Agent...</option>
            {agents.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name} ({a.model})
              </option>
            ))}
          </select>
        </div>

        {/* Output Key */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1.5">
            Output Context Key
            <span className="text-[9px] text-slate-500 lowercase">(alphanumeric, no spaces)</span>
          </label>
          <input
            type="text"
            value={step.outputKey}
            onChange={(e) => onChange(step.id, { outputKey: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
            placeholder="e.g. summary_output"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 font-mono transition-colors"
          />
        </div>

        {/* Input Source Toggle */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Input Source Parameter</label>
          <select
            value={step.inputSource}
            onChange={(e) => onChange(step.id, { inputSource: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="user_input">Initial User Input (Default)</option>
            {validPreviousKeys.map((key) => (
              <option key={key} value={key}>
                Output Key: {key}
              </option>
            ))}
          </select>
        </div>

        {/* Optional Transform instructions */}
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
            Optional Output Transformation Instructions
            <span className="text-[9px] text-slate-500 normal-case">(Reshapes outputs before chaining)</span>
          </label>
          <textarea
            value={step.transformPrompt}
            onChange={(e) => onChange(step.id, { transformPrompt: e.target.value })}
            placeholder="e.g., Format the summaries as a clean JSON list, or Translate output text to Spanish."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 transition-colors resize-none h-16"
          />
        </div>

      </div>

    </div>
  );
}

// ----------------------------------------------------------------------------
// Main Pipeline Builder Component
// ----------------------------------------------------------------------------
export default function PipelineBuilder({
  pipelineId,
  onBack,
  onSaveSuccess
}: PipelineBuilderProps) {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

  // DND Kit Sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

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

  // Fetch agents list
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/agents`, getFetchOptions());
        if (res.ok) {
          const data = await res.json();
          setAgents(data);
        }
      } catch (err) {
        console.error("Failed to load agents list:", err);
      }
    };
    fetchAgents();
  }, [backendUrl, getFetchOptions]);

  // Fetch pipeline details if editing
  useEffect(() => {
    if (!pipelineId) {
      // Set a default empty step
      setSteps([
        {
          id: `step-${Date.now()}`,
          order: 1,
          agentId: "",
          inputSource: "user_input",
          outputKey: "step_1_output",
          transformPrompt: ""
        }
      ]);
      return;
    }

    const fetchPipelineDetails = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${backendUrl}/api/pipelines/${pipelineId}`, getFetchOptions());
        if (!res.ok) throw new Error("Failed to load pipeline parameters");
        const data = await res.json();

        setName(data.name);
        setDescription(data.description || "");

        // Map Mongoose step entries to builder state
        interface MappedStep {
          _id?: string;
          order: number;
          agentId?: { _id: string } | string | null;
          inputSource: string;
          outputKey: string;
          transformPrompt?: string;
        }

        const mappedSteps = data.steps.map((s: MappedStep) => {
          const rawAgentId = s.agentId;
          const resolvedAgentId = typeof rawAgentId === "object" && rawAgentId !== null
            ? rawAgentId._id
            : (rawAgentId || "");

          return {
            id: `step-${s._id || s.order}-${Math.random()}`,
            order: s.order,
            agentId: resolvedAgentId,
            inputSource: s.inputSource,
            outputKey: s.outputKey,
            transformPrompt: s.transformPrompt || ""
          };
        });
        setSteps(mappedSteps);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Error loading pipeline configuration";
        setError(errMsg);
      } finally {
        setLoading(false);
      }
    };

    fetchPipelineDetails();
  }, [pipelineId, backendUrl, getFetchOptions]);

  // Add Step Action
  const addStep = () => {
    const orderNum = steps.length + 1;
    const newStep: StepItem = {
      id: `step-new-${Date.now()}-${Math.random()}`,
      order: orderNum,
      agentId: "",
      inputSource: "user_input",
      outputKey: `step_${orderNum}_output`,
      transformPrompt: ""
    };
    setSteps([...steps, newStep]);
  };

  // Delete Step Action
  const deleteStep = (id: string) => {
    const filtered = steps.filter((s) => s.id !== id);
    // Recalculate orders
    const recalculated = filtered.map((s, idx) => ({
      ...s,
      order: idx + 1
    }));
    setSteps(recalculated);
  };

  // Change Step fields
  const handleStepChange = (id: string, updatedFields: Partial<StepItem>) => {
    const modified = steps.map((s) => {
      if (s.id === id) {
        return { ...s, ...updatedFields };
      }
      return s;
    });
    setSteps(modified);
  };

  // Drag and Drop reordering handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);

    const reordered = arrayMove(steps, oldIndex, newIndex);
    // Re-index step orders sequentially
    const updated = reordered.map((s, idx) => ({
      ...s,
      order: idx + 1
    }));

    setSteps(updated);
  };

  // Save Pipeline API Trigger
  const handleSavePipeline = async () => {
    setError(null);

    // Basic Validation
    if (!name.trim()) {
      setError("Pipeline name cannot be empty");
      return;
    }
    if (steps.length === 0) {
      setError("A pipeline must contain at least one action step");
      return;
    }
    const invalidStep = steps.find((s) => !s.agentId || !s.outputKey.trim());
    if (invalidStep) {
      setError("Please configure both Target Agent and Output Key parameters for all steps");
      return;
    }

    setSaving(true);
    try {
      // Map payload to match backend schema format
      const payload = {
        name: name.trim(),
        description: description.trim(),
        steps: steps.map((s) => ({
          order: s.order,
          agentId: s.agentId,
          inputSource: s.inputSource,
          outputKey: s.outputKey.trim(),
          transformPrompt: s.transformPrompt.trim()
        }))
      };

      const url = pipelineId
        ? `${backendUrl}/api/pipelines/${pipelineId}`
        : `${backendUrl}/api/pipelines`;
      const method = pipelineId ? "PUT" : "POST";

      const res = await fetch(url, getFetchOptions(method, payload));
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || `Server responded with status ${res.status}`);
      }

      onSaveSuccess();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to persist pipeline layout configuration";
      setError(errMsg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-3">
        <Layers className="w-8 h-8 text-blue-500 animate-pulse" />
        <span className="text-slate-400 text-xs font-mono">Loading builder canvas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header controls bar */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-905 p-4 rounded-xl border border-slate-900">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-slate-800 text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-900 rounded-lg transition-colors"
            title="Cancel and return to catalog"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-500" />
              {pipelineId ? "Modify Pipeline Layout" : "Assemble Multi-Agent Pipeline"}
            </h3>
            <p className="text-slate-400 text-[10px] mt-0.5">
              Chain outputs of multiple AI agents sequentially to create robust multi-agent automations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSavePipeline}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all shadow-md shadow-blue-600/10"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving Layout..." : "Save Pipeline"}
          </button>
        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 rounded-xl">
          {error}
        </div>
      )}

      {/* Canvas workspace layouts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: General Pipeline Configuration Info */}
        <div className="space-y-5 lg:col-span-1 bg-slate-900/10 border border-slate-900 rounded-2xl p-6 h-fit">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-900">
            <Settings className="w-4 h-4 text-slate-500" /> Pipeline Parameters
          </h4>

          <div className="space-y-4 pt-2">
            
            {/* Pipeline Name */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">Pipeline Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Document Summary and Translation"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">Description (Optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly state the goal of this multi-agent chaining flow..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 transition-colors resize-none h-24"
              />
            </div>

            {/* Explanatory guidelines widget */}
            <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 text-xs text-slate-400">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-cyan-400" /> Pipeline Guidelines
              </span>
              <p className="leading-relaxed text-[11px]">
                In this drag-and-drop workspace, you assemble sequential steps.
                Outputs of preceding agents are saved in a temporary context dictionary under the configured <strong className="text-slate-300 font-mono">Output Context Key</strong>.
              </p>
              <p className="leading-relaxed text-[11px] pt-1">
                Subsequent steps can toggle their inputs to ingest these keys, feeding the text as prompt payloads to downstream agents.
              </p>
            </div>

          </div>
        </div>

        {/* Right Side: Step Builder Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-200 text-sm">Sequence Action Steps</h4>
            
            <button
              onClick={addStep}
              className="bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Step
            </button>
          </div>

          {/* DnD Steps Area */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <SortableStep
                    key={step.id}
                    step={step}
                    index={index}
                    agents={agents}
                    allSteps={steps}
                    onChange={handleStepChange}
                    onDelete={deleteStep}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

        </div>

      </div>

    </div>
  );
}
