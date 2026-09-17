"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { AppIcons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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
    { agent: "Retrieval Engine (Cross-Lingual AR+EN)", status: "pending" },
    { agent: "Clinical Evidence Extractor", status: "pending" },
    { agent: "Contraindication & Safety Auditor", status: "pending" },
    { agent: "Bilingual Context & Policy Guard", status: "pending" },
    { agent: "Therapeutic Protocol Drafter", status: "pending" },
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
      { agent: "Retrieval Engine (Cross-Lingual AR+EN)", status: "running" },
      { agent: "Clinical Evidence Extractor", status: "pending" },
      { agent: "Contraindication & Safety Auditor", status: "pending" },
      { agent: "Bilingual Context & Policy Guard", status: "pending" },
      { agent: "Therapeutic Protocol Drafter", status: "pending" },
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
      <div className="flex-1 flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden shadow-xs">
        {/* Workspace Header */}
        <div className="p-4 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center">
              <AppIcons.copilot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground tracking-tight">Copilot Grounded Workspace</h2>
              <p className="text-[10px] text-muted-foreground font-mono">
                Assigned Domain Multi-Agent Pipeline · Real-Time Stream
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {twistEvaluation && (
              <Badge
                variant={twistEvaluation.isPermitted ? "success" : "destructive"}
                className="gap-1.5 font-mono text-[11px]"
              >
                <AppIcons.warning className="w-3.5 h-3.5" />
                TWIST GUARD: {twistEvaluation.isPermitted ? "PERMITTED" : "TRIPPED"} ({twistEvaluation.computedRiskIndex}/{twistEvaluation.threshold})
              </Badge>
            )}

            {isRefused ? (
              <Badge variant="destructive" className="gap-1.5 font-mono text-[11px]">
                <AppIcons.warning className="w-3.5 h-3.5" />
                REFUSED: LOW EVIDENCE
              </Badge>
            ) : streamedText.length > 0 ? (
              <Badge variant="success" className="gap-1.5 font-mono text-[11px]">
                <AppIcons.success className="w-3.5 h-3.5" />
                GROUNDED SYNTHESIS
              </Badge>
            ) : null}

            {streamedText && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-7 px-2.5 text-xs gap-1 text-slate-700"
              >
                {copied ? <AppIcons.check className="w-3 h-3 text-emerald-600" /> : <AppIcons.copy className="w-3 h-3" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Answer Content Panel */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans text-sm leading-relaxed bg-slate-50/30 flex flex-col">
          {streamedText.length === 0 && !isRefused && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4 select-none">
              <AppIcons.copilot
                className="w-7 h-7 text-sky-500 mb-3.5 shrink-0"
                aria-hidden="true"
              />
              <h3 className="text-base font-semibold text-slate-800 tracking-tight">
                Ask a domain-grounded clinical query
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1.5 leading-relaxed">
                The multi-agent orchestrator will perform hybrid pgvector retrieval, verify evidence with specialists, and stream citations.
              </p>
            </div>
          )}

          {isRefused && (
            <Card className="border-rose-200 bg-rose-50/50 p-4 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-rose-800 text-xs">
                <AppIcons.warning className="w-4 h-4 text-rose-600" />
                <span>Low-Evidence Refusal Triggered</span>
              </div>
              <p className="text-xs text-rose-700 mt-1.5 leading-normal">{refusalMessage}</p>
            </Card>
          )}

          {/* Twist Guard Alert Banner (TW-005) */}
          {twistEvaluation && !twistEvaluation.isPermitted && (
            <Card className="border-rose-200 bg-rose-50/50 p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between font-semibold text-rose-800 text-xs">
                <div className="flex items-center gap-2">
                  <AppIcons.warning className="w-4 h-4 text-rose-600" />
                  <span>Mandatory Safety Guard Active: Risk Ceiling Exceeded</span>
                </div>
                <Badge variant="destructive" className="font-mono text-[10px]">
                  Risk Index: {twistEvaluation.computedRiskIndex} / Ceiling: {twistEvaluation.threshold}
                </Badge>
              </div>
              <p className="text-[11px] text-rose-700 font-mono">
                Enforced Policy: {twistEvaluation.enforcedPolicy}
              </p>
              {twistEvaluation.violations.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-700 font-mono">
                  {twistEvaluation.violations.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* HITL Approval Banner */}
          {isAwaitingApproval && pendingApproval && (
            <Card className="border-amber-200 bg-amber-50/50 p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2 font-semibold text-amber-900 text-xs">
                <AppIcons.warning className="w-4 h-4 text-amber-600" />
                <span>Workflow Paused: Human Approval Required</span>
              </div>
              <p className="text-xs text-amber-800 leading-normal">{pendingApproval.proposedAction}</p>

              {pendingApproval.riskFlags.length > 0 && (
                <div className="space-y-1.5">
                  {pendingApproval.riskFlags.map((flag, i) => (
                    <div
                      key={i}
                      className={`px-2.5 py-1.5 rounded text-[11px] font-mono border ${
                        flag.severity === "CRITICAL"
                          ? "bg-rose-100/60 border-rose-200 text-rose-800"
                          : flag.severity === "HIGH"
                          ? "bg-amber-100/60 border-amber-200 text-amber-900"
                          : "bg-sky-100/60 border-sky-200 text-sky-800"
                      }`}
                    >
                      <span className="font-bold">{flag.severity}:</span> {flag.riskType} — {flag.detail}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-500 text-white gap-1.5 text-xs shadow-xs"
                  asChild
                >
                  <a href="/reviews">
                    <AppIcons.warning className="w-3.5 h-3.5" />
                    Review in HITL Queue
                    <AppIcons.arrowRight className="w-3 h-3" />
                  </a>
                </Button>
                <span className="text-[10px] font-mono text-amber-700 flex items-center gap-1">
                  <AppIcons.pending className="w-3 h-3" />
                  Approval ID: {pendingApproval.approvalId}
                </span>
              </div>
            </Card>
          )}

          {streamedText && (
            <Card className="p-5 shadow-xs border-slate-200 bg-card">
              <div className="prose prose-slate max-w-none text-slate-800 leading-relaxed whitespace-pre-wrap text-sm" dir="auto">
                {streamedText}
              </div>
            </Card>
          )}

          {/* Citations Chip Bar */}
          {citations.length > 0 && (
            <div className="pt-2">
              <p className="text-[11px] font-mono text-muted-foreground mb-2 font-semibold">
                VERIFIED CITATIONS ({citations.length}):
              </p>
              <div className="flex flex-wrap gap-2">
                {citations.map((c, i) => (
                  <button
                    key={c.citationId || i}
                    onClick={() => setSelectedCitation(c)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-[11px] font-mono text-sky-700 transition-colors shadow-2xs"
                  >
                    <span>[{c.documentName}, p.{c.page || 1}]</span>
                    <AppIcons.external className="w-2.5 h-2.5 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Multi-Agent Progress Rail */}
        <div className="px-5 py-2.5 border-t border-border bg-slate-50">
          <div className="flex items-center justify-between text-[11px] font-mono mb-2">
            <span className="text-muted-foreground font-semibold">
              LIVE AGENT WORKFLOW:
            </span>
            {streaming && <span className="text-sky-600 font-semibold animate-pulse">Running...</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {steps.map((step, idx) => (
              <div
                key={step.agent}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono flex items-center gap-1.5 border transition-all ${
                  step.status === "completed"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold"
                    : step.status === "running"
                    ? "bg-sky-50 border-sky-300 text-sky-700 font-semibold animate-pulse"
                    : step.status === "approval_pending"
                    ? "bg-amber-50 border-amber-300 text-amber-700 font-semibold animate-pulse"
                    : "bg-white border-slate-200 text-slate-400"
                }`}
              >
                <span className="font-bold">{String(idx + 1).padStart(2, "0")}</span>
                <span className="truncate">{step.agent}</span>
                {step.status === "approval_pending" && <AppIcons.pending className="w-3 h-3 text-amber-600" />}
              </div>
            ))}
          </div>
        </div>

        {/* Question Composer Form */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-card">
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
              dir="auto"
              rows={2}
              placeholder="Ask a question grounded in the clinical protocol corpus (English or Arabic)..."
              className="flex-1 bg-white border border-slate-200 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 resize-none font-sans"
            />
            {streaming ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleCancel}
                className="gap-1.5 text-xs font-semibold shrink-0 h-auto"
              >
                <AppIcons.stop className="w-3.5 h-3.5 fill-current" />
                Cancel
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!query.trim()}
                className="gap-1.5 text-xs font-semibold shrink-0 h-auto px-5 shadow-xs"
              >
                <AppIcons.send className="w-3.5 h-3.5" />
                Run
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Side Evidence Drawer (RET-003) */}
      {selectedCitation && (
        <div className="w-80 bg-card border border-border rounded-xl flex flex-col shrink-0 shadow-lg overflow-hidden animate-in slide-in-from-right-5">
          <div className="p-4 border-b border-border bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground font-mono">
              SOURCE EVIDENCE DRAWER
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCitation(null)}
              className="h-7 px-2 text-xs text-slate-500 hover:text-foreground"
            >
              Close
            </Button>
          </div>

          <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs">
            <div className="space-y-1 font-mono text-[11px]">
              <p className="text-muted-foreground">Document:</p>
              <p className="font-semibold text-slate-900">{selectedCitation.documentName}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground pt-1">
              <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                <span>Page:</span> <strong className="text-slate-800">{selectedCitation.page || 1}</strong>
              </div>
              <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                <span>RRF Score:</span> <strong className="text-emerald-600">{selectedCitation.score}</strong>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-mono text-muted-foreground">Verbatim Stored Chunk:</p>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap" dir="auto">
                {selectedCitation.excerpt}
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-sky-50 border border-sky-200 text-[10px] font-mono text-sky-800">
              ✓ Grounded Citation verified against pgvector similarity index.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
