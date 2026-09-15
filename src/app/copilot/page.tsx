"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Square,
  Bot,
  User,
  ShieldAlert,
  CheckCircle,
  ExternalLink,
  Sparkles,
  ChevronRight,
  Layers,
  Copy,
  Check,
  Cpu,
} from "lucide-react";

interface Citation {
  citationId: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  page?: number;
  clause?: string;
  excerpt: string;
  score?: number;
  channel?: string;
}

interface StepProgress {
  agent: string;
  status: "pending" | "running" | "completed";
}

export default function CopilotPage() {
  const [query, setQuery] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [isRefused, setIsRefused] = useState(false);
  const [refusalMessage, setRefusalMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // Workflow progress steps
  const [steps, setSteps] = useState<StepProgress[]>([
    { agent: "Retrieval Engine (Dense + Keyword RRF)", status: "pending" },
    { agent: "Clinical Evidence Extractor", status: "pending" },
    { agent: "Contraindication & Safety Auditor", status: "pending" },
    { agent: "Therapeutic Protocol Drafter (gpt-4o)", status: "pending" },
  ]);

  const eventSourceRef = useRef<EventSource | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || streaming) return;

    setStreaming(true);
    setStreamedText("");
    setCitations([]);
    setIsRefused(false);
    setRefusalMessage("");
    setSelectedCitation(null);

    // Reset steps
    setSteps([
      { agent: "Retrieval Engine (Dense + Keyword RRF)", status: "running" },
      { agent: "Clinical Evidence Extractor", status: "pending" },
      { agent: "Contraindication & Safety Auditor", status: "pending" },
      { agent: "Therapeutic Protocol Drafter (gpt-4o)", status: "pending" },
    ]);

    try {
      const initRes = await fetch("/api/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const { runId } = await initRes.json();
      setCurrentRunId(runId);

      // Open SSE stream
      const sse = new EventSource(`/api/runs/${runId}/stream`);
      eventSourceRef.current = sse;

      sse.addEventListener("step_start", (evt: any) => {
        const data = JSON.parse(evt.data);
        setSteps((prev) =>
          prev.map((s) => (s.agent.includes(data.agent) ? { ...s, status: "running" } : s))
        );
      });

      sse.addEventListener("step_complete", (evt: any) => {
        const data = JSON.parse(evt.data);
        setSteps((prev) =>
          prev.map((s) => (s.agent.includes(data.agent) ? { ...s, status: "completed" } : s))
        );
      });

      sse.addEventListener("token", (evt: any) => {
        const data = JSON.parse(evt.data);
        setStreamedText((prev) => prev + (data.token || ""));
      });

      sse.addEventListener("citation", (evt: any) => {
        const data = JSON.parse(evt.data);
        setCitations((prev) => [...prev, data.data]);
      });

      sse.addEventListener("refusal", (evt: any) => {
        const data = JSON.parse(evt.data);
        setIsRefused(true);
        setRefusalMessage(data.message);
      });

      sse.addEventListener("done", () => {
        setStreaming(false);
        setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
        sse.close();
      });

      sse.addEventListener("error", () => {
        setStreaming(false);
        sse.close();
      });
    } catch (err: any) {
      alert(`Query failed: ${err.message}`);
      setStreaming(false);
    }
  };

  const handleCancel = async () => {
    if (currentRunId) {
      await fetch(`/api/runs/${currentRunId}/cancel`, { method: "POST" });
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setStreaming(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(streamedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex gap-5 overflow-hidden">
      {/* Main Copilot Workspace */}
      <div className="flex-1 flex flex-col h-full bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Workspace Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Copilot Grounded Workspace</h2>
              <p className="text-[10px] text-slate-400 font-mono">
                Assigned Domain Multi-Agent Pipeline · gpt-4o Real-Time Stream
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {isRefused ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-[11px]">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                REFUSED: LOW EVIDENCE
              </span>
            ) : streamedText.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-[11px]">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                GROUNDED SYNTHESIS
              </span>
            ) : null}

            {streamedText && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Answer Content Panel */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans text-sm leading-relaxed">
          {streamedText.length === 0 && !isRefused && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 py-12">
              <Sparkles className="w-10 h-10 mb-3 text-sky-500 opacity-30 animate-pulse" />
              <p className="text-base font-semibold text-slate-400">Ask a domain-grounded query</p>
              <p className="text-xs text-slate-500 max-w-md text-center mt-1">
                The multi-agent orchestrator will perform hybrid pgvector retrieval, verify evidence with specialists, and stream citations.
              </p>
            </div>
          )}

          {isRefused && (
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-rose-400">
                <ShieldAlert className="w-4 h-4" />
                <span>Low-Evidence Refusal Triggered (RET-004)</span>
              </div>
              <p className="leading-normal">{refusalMessage}</p>
            </div>
          )}

          {streamedText && (
            <div className="prose prose-invert max-w-none text-slate-200 whitespace-pre-wrap">
              {streamedText}
            </div>
          )}

          {/* Citations Chip Bar */}
          {citations.length > 0 && (
            <div className="pt-4 border-t border-slate-800/80">
              <p className="text-[11px] font-mono text-slate-400 mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                VERIFIED CITATIONS ({citations.length}):
              </p>
              <div className="flex flex-wrap gap-2">
                {citations.map((c, i) => (
                  <button
                    key={c.citationId || i}
                    onClick={() => setSelectedCitation(c)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-mono text-sky-300 transition-colors shadow-sm"
                  >
                    <span>[{c.documentName}, p.{c.page || 1}]</span>
                    <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Multi-Agent Progress Rail */}
        <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-950/80">
          <div className="flex items-center justify-between text-[11px] font-mono mb-2">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              LIVE AGENT WORKFLOW:
            </span>
            {streaming && <span className="text-sky-400 animate-pulse">Running...</span>}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {steps.map((step, idx) => (
              <div
                key={step.agent}
                className={`px-2.5 py-1.5 rounded text-[10px] font-mono flex items-center gap-2 border transition-all ${
                  step.status === "completed"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : step.status === "running"
                    ? "bg-sky-500/10 border-sky-500/30 text-sky-300 animate-pulse"
                    : "bg-slate-900 border-slate-800 text-slate-500"
                }`}
              >
                <span className="font-bold">0{idx + 1}</span>
                <span className="truncate">{step.agent}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Question Composer Form */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800 bg-slate-900">
          <div className="flex gap-2">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              rows={2}
              placeholder="Ask a question grounded in the clinical protocol corpus (Enter to run, Shift+Enter for newline)..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-none font-sans"
            />
            {streaming ? (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-lg flex items-center gap-1.5 text-xs font-semibold shadow-lg shadow-rose-600/20 transition-all shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Cancel
              </button>
            ) : (
              <button
                type="submit"
                disabled={!query.trim()}
                className="px-5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded-lg flex items-center gap-1.5 text-xs font-semibold shadow-lg shadow-sky-600/20 transition-all shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                Run
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Side Evidence Drawer (RET-003) */}
      {selectedCitation && (
        <div className="w-80 bg-slate-900 border border-slate-800 rounded-xl flex flex-col shrink-0 shadow-2xl overflow-hidden animate-in slide-in-from-right-5">
          <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              SOURCE EVIDENCE DRAWER
            </h3>
            <button
              onClick={() => setSelectedCitation(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded bg-slate-800"
            >
              Close
            </button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs">
            <div className="space-y-1 font-mono text-[11px]">
              <p className="text-slate-400">Document:</p>
              <p className="font-semibold text-white">{selectedCitation.documentName}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-slate-400 pt-1">
              <div className="p-2 rounded bg-slate-950 border border-slate-800">
                <span>Page:</span> <strong className="text-slate-200">{selectedCitation.page || 1}</strong>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800">
                <span>RRF Score:</span> <strong className="text-emerald-400">{selectedCitation.score}</strong>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-mono text-slate-400">Verbatim Stored Chunk:</p>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                {selectedCitation.excerpt}
              </div>
            </div>

            <div className="p-2.5 rounded bg-sky-500/10 border border-sky-500/20 text-[10px] font-mono text-sky-300">
              ✓ Grounded Citation verified against pgvector similarity index.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
