"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  DollarSign,
  Cpu,
  Clock,
  CheckCircle2,
  AlertCircle,
  Layers,
  ChevronDown,
  ChevronRight,
  Database,
  Search,
  Filter,
  ShieldAlert,
  Sparkles,
  ExternalLink,
} from "lucide-react";

export default function RunTracePage() {
  const params = useParams();
  const router = useRouter();
  const runIdParam = (params?.runId as string) || "latest";

  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [usage, setUsage] = useState<any[]>([]);
  const [selectedStep, setSelectedStep] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRunData = async () => {
      try {
        setLoading(true);
        // 1. Fetch available runs
        const runsRes = await fetch("/api/evaluation/runs");
        const runsData = await runsRes.json();
        const recentRuns = runsData.recentResults || [];
        setRuns(recentRuns);

        // Determine active runId
        let targetId = runIdParam;
        if (targetId === "latest" && recentRuns.length > 0) {
          targetId = recentRuns[0].runId || recentRuns[0].id;
        }

        if (targetId && targetId !== "latest") {
          const res = await fetch(`/api/runs/${targetId}`);
          if (res.ok) {
            const data = await res.json();
            setSelectedRun(data.run);
            setSteps(data.steps || []);
            setUsage(data.usage || []);
            // Auto-select retrieval step if present
            const retStep = data.steps?.find((s: any) => s.stepType === "RETRIEVAL");
            setSelectedStep(retStep || data.steps?.[0] || null);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRunData();
  }, [runIdParam]);

  const retrievalTrace = steps.find((s) => s.stepType === "RETRIEVAL")?.outputPayload;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/20 text-cyan-400 font-semibold uppercase">
              EPIC 02 &amp; EPIC 07
            </span>
            <span className="text-xs text-slate-400">RET-005 · Trace &amp; Retrieval Inspector</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Trace &amp; Retrieval Inspector</h2>
          <p className="text-xs text-slate-400 mt-1">
            End-to-end telemetry: Dense pgvector candidates, PostgreSQL FTS candidates, RRF fusion scoring, and step waterfall.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 font-mono text-xs text-slate-300">
            Run ID: <strong className="text-sky-400">{selectedRun?.id || runIdParam}</strong>
          </div>
        </div>
      </div>

      {selectedRun ? (
        <div className="space-y-6">
          {/* Run Header KPIs (Part 3 Section 4) */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono">
              <span className="text-[10px] text-slate-500 uppercase">Correlation ID</span>
              <p className="text-xs text-sky-300 font-bold truncate mt-1">{selectedRun.correlationId}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono">
              <span className="text-[10px] text-slate-500 uppercase">Execution Status</span>
              <p className="text-xs text-emerald-400 font-bold mt-1">{selectedRun.status}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono">
              <span className="text-[10px] text-slate-500 uppercase">Configured Model</span>
              <p className="text-xs text-sky-400 font-bold mt-1">gpt-4o / 1536d</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono">
              <span className="text-[10px] text-slate-500 uppercase">Total Tokens / Cost</span>
              <p className="text-xs text-emerald-400 font-bold mt-1">
                {usage.reduce((acc, u) => acc + u.totalTokens, 0)} tok / $
                {usage.reduce((acc, u) => acc + u.costUsd, 0).toFixed(5)}
              </p>
            </div>
          </div>

          {/* User Query Banner */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 font-sans text-xs">
            <span className="font-mono text-[10px] text-slate-400 uppercase font-semibold">User Query:</span>
            <p className="text-slate-100 font-medium text-sm mt-1">&quot;{selectedRun.query}&quot;</p>
          </div>

          {/* Waterfall Steps Timeline */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-white font-mono mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                EXECUTION SPAN WATERFALL ({steps.length} SPANS)
              </span>
              <span className="text-xs font-normal text-slate-400">Click any span to inspect payload</span>
            </h3>

            <div className="space-y-2">
              {steps.map((step, idx) => {
                const isSelected = selectedStep?.id === step.id;
                return (
                  <div
                    key={step.id}
                    onClick={() => setSelectedStep(step)}
                    className={`p-3 rounded-lg border flex items-center justify-between text-xs font-mono cursor-pointer transition-all ${
                      isSelected
                        ? "bg-slate-800 border-sky-500 shadow-md"
                        : "bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded bg-slate-800 text-sky-400 flex items-center justify-center font-bold text-[11px]">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-white">{step.agent || step.stepType}</p>
                        <p className="text-[10px] text-slate-500">SPAN TYPE: {step.stepType}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-[11px] text-slate-400">
                        {step.latencyMs ? `${step.latencyMs}ms` : "< 50ms"}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px]">
                        {step.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RETRIEVAL DEBUG INSPECTOR (RET-005) */}
          {retrievalTrace && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    RETRIEVAL DEBUG INSPECTOR (RET-001 to RET-005)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Deterministic Reciprocal Rank Fusion (RRF) breakdown with dual-channel candidate scoring
                  </p>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Formula: {retrievalTrace.fusionFormula || "RRF(k=60)"}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded font-bold ${
                      retrievalTrace.refusalDecision === "REFUSED"
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                        : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    }`}
                  >
                    GATE: {retrievalTrace.refusalDecision || "PROCEED"} (Score: {retrievalTrace.evidenceScore})
                  </span>
                </div>
              </div>

              {/* Applied Filters Card (RET-002) */}
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-400 mb-1.5 font-bold">
                  <Filter className="w-3.5 h-3.5 text-sky-400" />
                  <span>APPLIED METADATA FILTERS (RET-002 Scope):</span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {retrievalTrace.appliedFilters && Object.keys(retrievalTrace.appliedFilters).length > 0 ? (
                    Object.entries(retrievalTrace.appliedFilters).map(([k, v]) => (
                      <span key={k} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {k}: <strong>{String(v)}</strong>
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500">None (Full Corpus Active Version Scope)</span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Active Versions Only: <strong>TRUE</strong>
                  </span>
                </div>
              </div>

              {/* Dual Channel Candidate Tables */}
              <div className="grid grid-cols-2 gap-4">
                {/* Dense Channel */}
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-sky-400 font-mono flex items-center justify-between">
                    <span>1. DENSE PGVECTOR CHANNEL (Top-K)</span>
                    <span className="text-[10px] text-slate-500">&lt;=&gt; Cosine Distance</span>
                  </h4>
                  <div className="space-y-2">
                    {retrievalTrace.denseTopK?.map((d: any) => (
                      <div key={d.chunkId} className="p-2.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono">
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                          <span className="text-sky-300 font-bold">Rank #{d.rank} · {d.chunkId}</span>
                          <span className="text-emerald-400">Sim: {(d.score * 100).toFixed(1)}%</span>
                        </div>
                        <p className="text-slate-300 font-sans text-xs truncate">{d.textSnippet}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Keyword Channel */}
                <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-indigo-400 font-mono flex items-center justify-between">
                    <span>2. KEYWORD POSTGRESQL FTS (Top-K)</span>
                    <span className="text-[10px] text-slate-500">ts_rank_cd</span>
                  </h4>
                  <div className="space-y-2">
                    {retrievalTrace.keywordTopK?.map((k: any) => (
                      <div key={k.chunkId} className="p-2.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] font-mono">
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                          <span className="text-indigo-300 font-bold">Rank #{k.rank} · {k.chunkId}</span>
                          <span className="text-purple-400">FTS Rank: {(k.score * 100).toFixed(1)}%</span>
                        </div>
                        <p className="text-slate-300 font-sans text-xs truncate">{k.textSnippet}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fused Candidates & Explainability (RET-001 & RET-005) */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-emerald-400 font-mono">
                  3. FUSED CANDIDATES &amp; RANK EXPLANABILITY (RRF)
                </h4>
                <div className="space-y-2">
                  {retrievalTrace.fusedResults?.map((f: any, idx: number) => {
                    const isSelected = retrievalTrace.selectedChunks?.includes(f.chunkId);
                    return (
                      <div
                        key={f.chunkId}
                        className={`p-3 rounded-lg border text-xs font-mono space-y-1.5 ${
                          isSelected
                            ? "bg-slate-950 border-emerald-500/50 shadow-sm"
                            : "bg-slate-950/50 border-slate-800 opacity-60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center text-[10px]">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-white">{f.documentName}</span>
                            <span className="text-[10px] text-slate-500">v{f.version} · p.{f.page || 1}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                SELECTED FOR DRAFTING
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-400 text-[11px] font-bold">
                              RRF: {f.rrfScore}
                            </span>
                          </div>
                        </div>

                        {/* Explainability Chip (RET-005) */}
                        <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono">
                          <strong>Scoring Rationale:</strong> {f.explanation}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Token & Cost Breakdown Panel (Part 3 Section 4) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-white font-mono mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              PER-CALL TOKEN USAGE &amp; COST ACCOUNTING (OBS-002)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Provider / Model</th>
                    <th className="py-2.5 px-4">Call Type</th>
                    <th className="py-2.5 px-4">Prompt Tokens</th>
                    <th className="py-2.5 px-4">Completion Tokens</th>
                    <th className="py-2.5 px-4">Total Tokens</th>
                    <th className="py-2.5 px-4 text-right">Cost (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {usage.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-bold text-sky-400">{u.provider} / {u.model}</td>
                      <td className="py-2.5 px-4">{u.callType}</td>
                      <td className="py-2.5 px-4">{u.promptTokens}</td>
                      <td className="py-2.5 px-4">{u.completionTokens}</td>
                      <td className="py-2.5 px-4 font-semibold text-white">{u.totalTokens}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                        ${Number(u.costUsd || 0).toFixed(5)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center text-slate-500 text-xs">
          <Activity className="w-8 h-8 mx-auto mb-2 text-sky-400 opacity-40" />
          <p className="font-medium text-slate-400">Select a run from the history or submit a query on Copilot</p>
          <p className="text-[10px] mt-1 text-slate-600">
            Traces visualize dense candidates, FTS candidates, RRF fusion, and per-token pricing.
          </p>
        </div>
      )}
    </div>
  );
}
