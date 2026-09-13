"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  AlertTriangle,
  Clock,
  ArrowRight,
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
  status: "pending" | "running" | "completed" | "approval_pending";
}

interface ApprovalInfo {
  approvalId: string;
  riskLevel: string;
  proposedAction: string;
  riskFlags: Array<{ riskType: string; severity: string; detail: string }>;
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

  // HITL approval state
  const [pendingApproval, setPendingApproval] = useState<ApprovalInfo | null>(null);
  const [isAwaitingApproval, setIsAwaitingApproval] = useState(false);

  // Mandatory Twist state (TW-005)
  const [twistEvaluation, setTwistEvaluation] = useState<{
    isPermitted: boolean;
    computedRiskIndex: number;
    threshold: number;
    enforcedPolicy: string;
    violations: string[];
  } | null>(null);

  // Workflow progress steps
  const [steps, setSteps] = useState<StepProgress[]>([
    { agent: "Retrieval Engine (Dense + Keyword RRF)", status: "pending" },
    { agent: "Clinical Evidence Extractor", status: "pending" },
    { agent: "Contraindication & Safety Auditor", status: "pending" },
    { agent: "Mandatory Twist Guard", status: "pending" },
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
    setPendingApproval(null);
    setIsAwaitingApproval(false);
    setSelectedCitation(null);
    setTwistEvaluation(null);

    // Reset steps
    setSteps([
      { agent: "Retrieval Engine (Dense + Keyword RRF)", status: "running" },
      { agent: "Clinical Evidence Extractor", status: "pending" },
      { agent: "Contraindication & Safety Auditor", status: "pending" },
      { agent: "Mandatory Twist Guard", status: "pending" },
      { agent: "Therapeutic Protocol Drafter (gpt-4o)", status: "pending" },
    ]);

    try {
      const initRes = await fetch("/api/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to initiate query (${initRes.status})`);
      }

      const { runId } = await initRes.json();
      setCurrentRunId(runId);

      // Open SSE stream
      const sse = new EventSource(`/api/runs/${runId}/stream`);
      eventSourceRef.current = sse;

      sse.addEventListener("step_start", (evt: any) => {
        const data = JSON.parse(evt.data);
        setSteps((prev) =>
          prev.map((s) => {
            const match =
              s.agent.toLowerCase().includes(data.agent.toLowerCase()) ||
              data.agent.toLowerCase().includes(s.agent.toLowerCase());
            return match ? { ...s, status: "running" } : s;
          })
        );
      });

      sse.addEventListener("step_complete", (evt: any) => {
        const data = JSON.parse(evt.data);
        setSteps((prev) =>
          prev.map((s) => {
            const match =
              s.agent.toLowerCase().includes(data.agent.toLowerCase()) ||
              data.agent.toLowerCase().includes(s.agent.toLowerCase());
            return match ? { ...s, status: "completed" } : s;
          })
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
        setStreaming(false);
        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === 0
              ? { ...s, status: "completed" }
              : { ...s, status: "pending" }
          )
        );
        sse.close();
      });

      // TW-005: Handle twist_evaluation event — live risk guard state
      sse.addEventListener("twist_evaluation", (evt: any) => {
        const data = JSON.parse(evt.data);
        if (data.data) {
          setTwistEvaluation(data.data);
        }
      });

      // HITL-006: Handle approval_required event — workflow paused
      sse.addEventListener("approval_required", (evt: any) => {
        const data = JSON.parse(evt.data);
        const approvalData = data.data || data;
        setPendingApproval({
          approvalId: approvalData.approvalId,
          riskLevel: approvalData.riskLevel || "HIGH",
          proposedAction: approvalData.proposedAction || "Action requires human review",
          riskFlags: approvalData.riskFlags || [],
        });
        setIsAwaitingApproval(true);
        setStreaming(false);

        // Update progress rail to show approval gate
        setSteps((prev) => [
          ...prev.map((s) =>
            s.status === "running" ? { ...s, status: "completed" as const } : s
          ),
          { agent: "HITL Approval Gate", status: "approval_pending" as const },
        ]);

        sse.close();
      });

      sse.addEventListener("done", () => {
        setStreaming(false);
        setSteps((prev) => prev.map((s) => ({ ...s, status: "completed" })));
        sse.close();
      });

      sse.addEventListener("error", (evt: any) => {
        setStreaming(false);
        if (evt.data) {
          try {
            const data = JSON.parse(evt.data);
            if (data.message) {
              setStreamedText((prev) => prev || `Workflow notification: ${data.message}`);
            }
          } catch {}
        }
        setSteps((prev) =>
          prev.map((s) => (s.status === "running" ? { ...s, status: "completed" } : s))
        );
        sse.close();
      });

      sse.onerror = () => {
        setStreaming(false);
        setSteps((prev) =>
          prev.map((s) => (s.status === "running" ? { ...s, status: "completed" } : s))
        );
        sse.close();
      };
    } catch (err: any) {
      alert(`Query failed: ${err.message}`);
      setStreaming(false);
      setSteps((prev) =>
        prev.map((s) => (s.status === "running" ? { ...s, status: "completed" } : s))
      );
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
            {twistEvaluation && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-[11px] ${
                  twistEvaluation.isPermitted
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                TWIST GUARD: {twistEvaluation.isPermitted ? "PERMITTED" : "TRIPPED"} ({twistEvaluation.computedRiskIndex}/{twistEvaluation.threshold})
              </span>
            )}

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

          {/* Twist Guard Alert Banner (TW-005) */}
          {twistEvaluation && !twistEvaluation.isPermitted && (
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs space-y-2">
              <div className="flex items-center justify-between font-semibold text-rose-400">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Mandatory Twist Guard Active: Risk Ceiling Exceeded (TW-002 / TW-005)</span>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                  Risk Index: {twistEvaluation.computedRiskIndex} / Ceiling: {twistEvaluation.threshold}
                </span>
              </div>
              <p className="text-[11px] text-rose-200/80 font-mono">
                Enforced Policy: {twistEvaluation.enforcedPolicy}
              </p>
              {twistEvaluation.violations.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-300/90 font-mono">
                  {twistEvaluation.violations.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* HITL Approval Banner */}
          {isAwaitingApproval && pendingApproval && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-3">
              <div className="flex items-center gap-2 font-semibold text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Workflow Paused: Human Approval Required (HITL-002)</span>
              </div>
              <p className="leading-normal text-amber-200/80">{pendingApproval.proposedAction}</p>

              {pendingApproval.riskFlags.length > 0 && (
                <div className="space-y-1.5">
                  {pendingApproval.riskFlags.map((flag, i) => (
                    <div
                      key={i}
                      className={`px-2.5 py-1.5 rounded text-[11px] font-mono border ${
                        flag.severity === "CRITICAL"
                          ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                          : flag.severity === "HIGH"
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                          : "bg-sky-500/10 border-sky-500/30 text-sky-300"
                      }`}
                    >
                      <span className="font-bold">{flag.severity}:</span> {flag.riskType} — {flag.detail}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <a
                  href="/reviews"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-lg shadow-amber-600/20 transition-all"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Review in HITL Queue
                  <ArrowRight className="w-3 h-3" />
                </a>
                <span className="text-[10px] font-mono text-amber-400/60 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Approval ID: {pendingApproval.approvalId}
                </span>
              </div>
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
          <div className="flex flex-wrap gap-2">
            {steps.map((step, idx) => (
              <div
                key={step.agent}
                className={`px-2.5 py-1.5 rounded text-[10px] font-mono flex items-center gap-2 border transition-all ${
                  step.status === "completed"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : step.status === "running"
                    ? "bg-sky-500/10 border-sky-500/30 text-sky-300 animate-pulse"
                    : step.status === "approval_pending"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse"
                    : "bg-slate-900 border-slate-800 text-slate-500"
                }`}
              >
                <span className="font-bold">{String(idx + 1).padStart(2, "0")}</span>
                <span className="truncate">{step.agent}</span>
                {step.status === "approval_pending" && <Clock className="w-3 h-3 text-amber-400" />}
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
