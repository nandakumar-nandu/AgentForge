/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useCallback } from "react";
import {
  FileCode2,
  Play,
  Plus,
  Loader2,
  AlertTriangle,
  Cpu,
  RefreshCw,
  Sparkles,
  Layers,
  HelpCircle
} from "lucide-react";

export interface Template {
  id: string;
  name: string;
  type: "receptionist" | "testimonial" | "qa" | "custom";
  description: string;
  useCase: string;
  systemPrompt: string;
  model: "gpt-4o" | "claude-3-5-sonnet";
}

interface TemplatesPageProps {
  onSelectTemplate: (template: Template) => void;
}

export default function TemplatesPage({ onSelectTemplate }: TemplatesPageProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

  /**
   * Action Handler: Fetches the pre-built prompt templates from Express API.
   */
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/templates`);
      if (!res.ok) {
        throw new Error(`Server returned error status ${res.status}`);
      }
      const data = await res.json();
      setTemplates(data);
    } catch (err: any) {
      console.error("Failed to load prompt templates:", err);
      setError("Failed to load templates. Operating in offline template library view.");
      
      // Fallback local templates in case backend server is unreachable
      setTemplates([
        {
          id: "ai-receptionist",
          name: "AI Receptionist",
          type: "receptionist",
          description: "Greet visitors, answer business FAQs, and route inquiries.",
          useCase: "Customer support desks, business reception routing, and auto-answering common FAQs.",
          systemPrompt: "You are a professional, warm, and helpful virtual receptionist. Greet visitors politely and assist them with their queries. Answer questions clearly, using only verified business guidelines. If a customer asks a question that is not covered in your reference context, politely explain that you do not have that information and offer to escalate the request to human support. For complex queries (e.g., refunds, key account settings), acknowledge the request and inform the visitor that support is being notified.",
          model: "claude-3-5-sonnet"
        },
        {
          id: "testimonial-collector",
          name: "Testimonial Collector",
          type: "testimonial",
          description: "Guide users through post-purchase feedback interviews.",
          useCase: "Post-transaction email flows, customer reviews collection, and feedback interviews.",
          systemPrompt: "You are an interviewer gather customer testimonial reviews. Your goal is to guide the user through a structured interview flow to collect high-fidelity feedback. Ask questions one at a time. First, ask about their overall experience. Second, probe into what specific features they liked most. Third, ask about any points of friction. Keep your tone encouraging, conversational, and appreciative. Once all three parts are answered, thank the user and summarize their testimonial in a bulleted feedback format.",
          model: "gpt-4o"
        },
        {
          id: "document-qa",
          name: "Document Q&A",
          type: "qa",
          description: "Fact-based query engine focused strictly on uploaded context.",
          useCase: "Technical manuals, developer documentation queries, or strict legal agreement reviews.",
          systemPrompt: "You are a precise Document Q&A assistant. Your task is to answer queries strictly using the provided document texts and reference contexts. Do not assume, extrapolate, or bring in outside knowledge. Format your answers with clear citations referencing the sections of the text you extracted from. If the context does not contain the answer, reply with: 'I cannot answer this query based on the provided documents.' Keep responses concise and factual.",
          model: "claude-3-5-sonnet"
        }
      ]);
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Helper styles matching templates status categories
  const getCategoryColor = (type: string) => {
    switch (type) {
      case "receptionist": return "bg-teal-500/10 text-teal-400 border border-teal-500/20";
      case "testimonial": return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
      case "qa": return "bg-pink-500/10 text-pink-400 border border-pink-500/20";
      default: return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Controls Bar */}
      <div className="flex justify-between items-center bg-slate-900/20 p-4 rounded-xl border border-slate-900">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2 text-white">
            <FileCode2 className="w-5 h-5 text-blue-500" /> Prompt Templates
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            Pre-built system instructions engineered for specific agent orchestrator personas.
          </p>
        </div>
        <button
          onClick={fetchTemplates}
          disabled={loading}
          className="flex items-center gap-1.5 border border-slate-800 text-slate-300 hover:text-white bg-slate-950/40 hover:bg-slate-900 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wider uppercase transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Library
        </button>
      </div>

      {/* Warning Notice Banner */}
      {error && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && templates.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3 bg-slate-950/20 border border-slate-950 rounded-2xl">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <span className="text-slate-500 text-xs font-mono">Syncing template repository...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-slate-950/40 border border-slate-900 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-slate-800 transition-all duration-200"
            >
              {/* Card Main Body */}
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-start gap-2.5">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-200 text-sm font-sans">{tpl.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-wider ${getCategoryColor(tpl.type)}`}>
                      {tpl.type}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono flex items-center gap-0.5">
                    <Cpu className="w-3.5 h-3.5 text-cyan-600" /> {tpl.model}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed font-sans min-h-[40px]">
                  {tpl.description}
                </p>

                {/* Use Case details */}
                <div className="space-y-1 bg-slate-900/20 p-3 rounded-xl border border-slate-900">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Layers className="w-3 h-3 text-slate-600" /> Primary Use Case
                  </span>
                  <p className="text-[10px] text-slate-400 leading-normal">{tpl.useCase}</p>
                </div>

                {/* Prompt instructions code pre-box */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide block">System Prompt Preview</span>
                  <pre className="bg-slate-950 p-4 border border-slate-900 rounded-lg text-[10px] font-mono text-slate-400 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap select-all">
                    {tpl.systemPrompt}
                  </pre>
                </div>
              </div>

              {/* Action Button Footer */}
              <div className="p-4 border-t border-slate-900/60 bg-slate-950/20">
                <button
                  onClick={() => onSelectTemplate(tpl)}
                  className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all shadow-md shadow-blue-600/10"
                >
                  <Plus className="w-3.5 h-3.5" /> Use This Template
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
