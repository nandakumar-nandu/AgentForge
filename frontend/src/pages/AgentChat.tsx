"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  ArrowLeft,
  Bot,
  User,
  Loader2,
  Cpu,
  AlertTriangle,
  RefreshCw
} from "lucide-react";

export interface AgentChatProps {
  agentId: string;
  agentName: string;
  model: string;
  onBack: () => void;
}

interface Message {
  _id?: string;
  sender: "user" | "agent";
  content: string;
  timestamp?: string;
}

const MOCK_CONVO_FALLBACK: Message[] = [
  {
    _id: "msg-1",
    sender: "agent",
    content: "Hello! I am initialized and ready. What task or inquiry can I assist you with today?",
    timestamp: new Date(Date.now() - 600000).toISOString()
  }
];

export default function AgentChat({ agentId, agentName, model, onBack }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [usingFallbacks, setUsingFallbacks] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

  // Automatically scroll message pane to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  // Fetch dialog log from backend
  const fetchChatHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUsingFallbacks(false);
    try {
      const res = await fetch(`${backendUrl}/api/agents/${agentId}/chat`);
      if (!res.ok) {
        throw new Error(`API returned status ${res.status}`);
      }
      const data = await res.json();
      setMessages(data);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to retrieve chat history";
      console.warn("Failed to retrieve chat history from server. Operating in mock mode.", errMsg);
      setMessages(MOCK_CONVO_FALLBACK);
      setUsingFallbacks(true);
      setError("Backend connection offline. Chat is running in simulation mode.");
    } finally {
      setLoading(false);
    }
  }, [agentId, backendUrl]);

  useEffect(() => {
    fetchChatHistory();
  }, [fetchChatHistory]);

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    setInputText("");

    // Append user message immediately
    const userMsg: Message = {
      _id: `msg-user-${Date.now()}`,
      sender: "user",
      content: userText,
      timestamp: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      if (usingFallbacks) {
        // Simulated lag response
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const agentMsg: Message = {
          _id: `msg-agent-${Date.now()}`,
          sender: "agent",
          content: `[Simulated Reply]
I received your message: "${userText}".
To test live completions, please set up real keys in backend/.env.`,
          timestamp: new Date().toISOString()
        };
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        const res = await fetch(`${backendUrl}/api/agents/${agentId}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ message: userText })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || `Server returned error status ${res.status}`);
        }

        const data = await res.json();
        // Append response reply
        const agentMsg: Message = {
          _id: data.agentMessage?._id || `msg-agent-${Date.now()}`,
          sender: "agent",
          content: data.reply,
          timestamp: data.agentMessage?.timestamp || new Date().toISOString()
        };
        setMessages((prev) => [...prev, agentMsg]);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to dispatch chat query";
      // Show system error bubble
      const errBubble: Message = {
        _id: `msg-err-${Date.now()}`,
        sender: "agent",
        content: `🚨 Error communicating with Agent: ${errMsg}`,
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, errBubble]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-slate-900/10 border border-slate-900 rounded-2xl overflow-hidden">
      
      {/* Header Bar */}
      <header className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Return to Directory"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h3 className="font-bold text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-500" /> {agentName}
            </h3>
            <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
              <Cpu className="w-3 h-3 text-cyan-500" /> Model: {model}
            </span>
          </div>
        </div>
        <div>
          <button
            onClick={fetchChatHistory}
            className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Reload dialogue session logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Connection Notice */}
      {usingFallbacks && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-[10px] text-amber-400 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{error || "Backend server offline. Chat completions are currently simulated."}</span>
        </div>
      )}

      {/* Messages Pane */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/20">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <span className="text-slate-500 text-xs font-mono">Fetching conversation log...</span>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const isUser = msg.sender === "user";
              return (
                <div
                  key={msg._id || index}
                  className={`flex ${isUser ? "justify-end" : "justify-start"} items-start gap-2.5 animate-in fade-in duration-200`}
                >
                  {/* Left Avatar for agent */}
                  {!isUser && (
                    <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-blue-400" />
                    </div>
                  )}
                  
                  {/* Message Bubble content */}
                  <div
                    className={`max-w-md rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      isUser
                        ? "bg-blue-600 text-white rounded-tr-none"
                        : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none whitespace-pre-wrap"
                    }`}
                  >
                    <p className="leading-relaxed">{msg.content}</p>
                    {msg.timestamp && (
                      <span className="text-[9px] text-slate-500 block text-right mt-1.5 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {/* Right Avatar for user */}
                  {isUser && (
                    <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-slate-300" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Simulated typing animation */}
            {sending && (
              <div className="flex justify-start items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-blue-400" />
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input controls form */}
      <form onSubmit={handleSendMessage} className="p-4 bg-slate-900 border-t border-slate-800 flex gap-2">
        <input
          type="text"
          disabled={loading || sending}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={sending ? "Waiting for agent completion reply..." : "Write message prompt to test agent behavior..."}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-blue-500 disabled:opacity-60 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || sending || !inputText.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white p-2.5 rounded-lg transition-colors flex items-center justify-center"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

    </div>
  );
}
