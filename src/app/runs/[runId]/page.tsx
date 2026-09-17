"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppIcons } from "@/components/ui/icons";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

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
  const twistStep = steps.find((s) => s.stepType === "GUARDRAIL" || s.agent?.includes("Twist Guard"));
  const twistData = twistStep?.outputPayload as any;

  // Active configured model string
  const activeModelDisplay =
    usage.length > 0
      ? `${usage[0].model} (${usage[0].provider})`
      : selectedRun?.model || "active-llm / 1536d";

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm bg-card border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="info" className="text-[11px] font-mono uppercase">
              HYBRID TELEMETRY
            </Badge>
            <span className="text-xs text-muted-foreground">Trace &amp; Retrieval Inspector</span>
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">Trace &amp; Retrieval Inspector</h2>
          <p className="text-xs text-muted-foreground mt-1">
            End-to-end telemetry: Dense pgvector candidates, PostgreSQL FTS candidates, RRF fusion scoring, and step waterfall.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-md bg-muted border border-border font-mono text-xs text-muted-foreground">
            Run ID: <strong className="text-foreground">{selectedRun?.id || runIdParam}</strong>
          </div>
        </div>
      </Card>

      {selectedRun ? (
        <div className="space-y-6">
          {/* Run Header KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 font-mono shadow-xs bg-card border-border">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Correlation ID</span>
              <p className="text-xs text-primary font-bold truncate mt-1">{selectedRun.correlationId}</p>
            </Card>
            <Card className="p-4 font-mono shadow-xs bg-card border-border">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Execution Status</span>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-1">{selectedRun.status}</p>
            </Card>
            <Card className="p-4 font-mono shadow-xs bg-card border-border">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Active Model</span>
              <p className="text-xs text-primary font-bold truncate mt-1">{activeModelDisplay}</p>
            </Card>
            <Card className="p-4 font-mono shadow-xs bg-card border-border">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Tokens / Cost</span>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                {usage.reduce((acc, u) => acc + (u.totalTokens || 0), 0)} tok / $
                {usage.reduce((acc, u) => acc + (u.costUsd || 0), 0).toFixed(5)}
              </p>
            </Card>
          </div>

          {/* User Query Banner */}
          <Card className="p-4 font-sans text-xs shadow-xs bg-muted/30 border-border">
            <span className="font-mono text-[10px] text-muted-foreground uppercase font-semibold">User Query:</span>
            <p className="text-foreground font-medium text-sm mt-1">&quot;{selectedRun.query}&quot;</p>
          </Card>

          {/* Waterfall Steps Timeline */}
          <Card className="p-5 shadow-sm bg-card border-border">
            <h3 className="text-sm font-bold text-foreground font-mono mb-4 flex items-center justify-between">
              <span>EXECUTION SPAN WATERFALL ({steps.length} SPANS)</span>
              <span className="text-xs font-normal text-muted-foreground">Click any span to inspect payload</span>
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
                        ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                        : "bg-background border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded bg-muted text-primary flex items-center justify-center font-bold text-[11px]">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">{step.agent || step.stepType}</p>
                        <p className="text-[10px] text-muted-foreground">SPAN TYPE: {step.stepType}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-[11px] text-muted-foreground">
                        {step.latencyMs ? `${step.latencyMs}ms` : "< 50ms"}
                      </span>
                      <Badge variant="success" className="text-[10px]">
                        {step.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* RETRIEVAL DEBUG INSPECTOR */}
          {retrievalTrace && (
            <Card className="p-5 space-y-6 shadow-sm bg-card border-border">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border pb-4 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-foreground font-mono">
                    RETRIEVAL DEBUG INSPECTOR
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Deterministic Reciprocal Rank Fusion (RRF) breakdown with dual-channel candidate scoring
                  </p>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <Badge variant="outline" className="text-muted-foreground">
                    Formula: {retrievalTrace.fusionFormula || "RRF(k=60)"}
                  </Badge>
                  <Badge
                    variant={retrievalTrace.refusalDecision === "REFUSED" ? "destructive" : "success"}
                    className="font-bold"
                  >
                    GATE: {retrievalTrace.refusalDecision || "PROCEED"} (Score: {retrievalTrace.evidenceScore})
                  </Badge>
                </div>
              </div>

              {/* Applied Filters Card */}
              <div className="p-3.5 rounded-lg bg-muted/40 border border-border text-xs font-mono">
                <div className="text-muted-foreground mb-1.5 font-bold">
                  APPLIED METADATA FILTERS:
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {retrievalTrace.appliedFilters && Object.keys(retrievalTrace.appliedFilters).length > 0 ? (
                    Object.entries(retrievalTrace.appliedFilters).map(([k, v]) => (
                      <Badge key={k} variant="secondary" className="font-mono">
                        {k}: <strong className="ml-1 text-foreground">{String(v)}</strong>
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">None (Full Corpus Active Version Scope)</span>
                  )}
                  <Badge variant="success" className="font-mono">
                    Active Versions Only: <strong>TRUE</strong>
                  </Badge>
                </div>
              </div>

              {/* Dual Channel Candidate Tables */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Dense Channel */}
                <div className="p-4 rounded-lg bg-muted/20 border border-border space-y-3">
                  <h4 className="text-xs font-bold text-primary font-mono flex items-center justify-between">
                    <span>1. DENSE PGVECTOR CHANNEL (Top-K)</span>
                    <span className="text-[10px] text-muted-foreground">&lt;=&gt; Cosine Distance</span>
                  </h4>
                  <div className="space-y-2">
                    {retrievalTrace.denseTopK?.map((d: any) => (
                      <div key={d.chunkId} className="p-2.5 rounded bg-card border border-border text-[11px] font-mono shadow-xs">
                        <div className="flex items-center justify-between text-muted-foreground mb-1">
                          <span className="text-primary font-bold">Rank #{d.rank} · {d.chunkId}</span>
                          <span className="text-emerald-600 dark:text-emerald-400">Sim: {(d.score * 100).toFixed(1)}%</span>
                        </div>
                        <p className="text-foreground font-sans text-xs truncate">{d.textSnippet}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Keyword Channel */}
                <div className="p-4 rounded-lg bg-muted/20 border border-border space-y-3">
                  <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono flex items-center justify-between">
                    <span>2. KEYWORD POSTGRESQL FTS (Top-K)</span>
                    <span className="text-[10px] text-muted-foreground">ts_rank_cd</span>
                  </h4>
                  <div className="space-y-2">
                    {retrievalTrace.keywordTopK?.map((k: any) => (
                      <div key={k.chunkId} className="p-2.5 rounded bg-card border border-border text-[11px] font-mono shadow-xs">
                        <div className="flex items-center justify-between text-muted-foreground mb-1">
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold">Rank #{k.rank} · {k.chunkId}</span>
                          <span className="text-purple-600 dark:text-purple-400">FTS Rank: {(k.score * 100).toFixed(1)}%</span>
                        </div>
                        <p className="text-foreground font-sans text-xs truncate">{k.textSnippet}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fused Candidates & Explainability */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  3. FUSED CANDIDATES &amp; RANK EXPLANABILITY (RRF)
                </h4>
                <div className="space-y-2">
                  {retrievalTrace.fusedResults?.map((f: any, idx: number) => {
                    const isSelected = retrievalTrace.selectedChunks?.includes(f.chunkId);
                    return (
                      <div
                        key={f.chunkId}
                        className={`p-3 rounded-lg border text-xs font-mono space-y-1.5 transition-all ${
                          isSelected
                            ? "bg-primary/5 border-emerald-500/50 shadow-xs ring-1 ring-emerald-500/20"
                            : "bg-card border-border opacity-75"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-[10px]">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-foreground">{f.documentName}</span>
                            <span className="text-[10px] text-muted-foreground">v{f.version} · p.{f.page || 1}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <Badge variant="success" className="text-[10px] font-bold">
                                SELECTED FOR DRAFTING
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-primary font-bold font-mono">
                              RRF: {f.rrfScore}
                            </Badge>
                          </div>
                        </div>

                        {/* Explainability Chip */}
                        <div className="p-2 rounded bg-muted/40 border border-border text-[11px] text-muted-foreground font-mono">
                          <strong className="text-foreground">Scoring Rationale:</strong> {f.explanation}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* SAFETY TWIST RISK GUARD TELEMETRY */}
          {twistData && (
            <Card className="p-5 space-y-4 shadow-sm bg-card border-border">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border pb-3 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-foreground font-mono">
                    SAFETY RISK GUARD TELEMETRY
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Deterministic Side-Effect Risk Guard · Enforces domain safety risk floor
                  </p>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <Badge
                    variant={twistData.isPermitted ? "success" : "destructive"}
                    className="font-bold"
                  >
                    STATUS: {twistData.isPermitted ? "PERMITTED" : "GUARDED / BLOCKED"}
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground">
                    Risk Index: <strong className="text-foreground ml-1">{twistData.computedRiskIndex}</strong> / Threshold:{" "}
                    <strong className="text-foreground ml-1">{twistData.threshold}</strong>
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                  <span className="text-muted-foreground text-[10px] uppercase font-bold">Enforced Domain Policy</span>
                  <p className="text-foreground">{twistData.enforcedPolicy || "Zero-tolerance off-label protocol variance"}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1">
                  <span className="text-muted-foreground text-[10px] uppercase font-bold">Execution Step</span>
                  <p className="text-foreground font-semibold">{twistStep?.agent || "Mandatory Twist Guard"}</p>
                </div>
              </div>

              {twistData.violations && twistData.violations.length > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-mono space-y-1">
                  <span className="text-destructive font-bold flex items-center gap-1.5">
                    <AppIcons.warning className="w-3.5 h-3.5" />
                    Risk Violations Detected:
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/90">
                    {twistData.violations.map((v: string, i: number) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {/* Token & Cost Breakdown Panel */}
          <Card className="p-5 shadow-sm bg-card border-border">
            <h3 className="text-sm font-bold text-foreground font-mono mb-4">
              PER-CALL TOKEN USAGE &amp; COST ACCOUNTING
            </h3>

            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50 font-mono text-[10px] uppercase">
                  <TableRow>
                    <TableHead className="py-2.5 px-4">Provider / Model</TableHead>
                    <TableHead className="py-2.5 px-4">Call Type</TableHead>
                    <TableHead className="py-2.5 px-4">Prompt Tokens</TableHead>
                    <TableHead className="py-2.5 px-4">Completion Tokens</TableHead>
                    <TableHead className="py-2.5 px-4">Total Tokens</TableHead>
                    <TableHead className="py-2.5 px-4 text-right">Cost (USD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs font-mono">
                  {usage.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        No usage data recorded for this run.
                      </TableCell>
                    </TableRow>
                  ) : (
                    usage.map((u) => (
                      <TableRow key={u.id} className="hover:bg-muted/30">
                        <TableCell className="py-2.5 px-4 font-bold text-primary">
                          {u.provider} / {u.model}
                        </TableCell>
                        <TableCell className="py-2.5 px-4 text-muted-foreground">{u.callType}</TableCell>
                        <TableCell className="py-2.5 px-4">{u.promptTokens}</TableCell>
                        <TableCell className="py-2.5 px-4">{u.completionTokens}</TableCell>
                        <TableCell className="py-2.5 px-4 font-semibold text-foreground">{u.totalTokens}</TableCell>
                        <TableCell className="py-2.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          ${Number(u.costUsd || 0).toFixed(5)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-12 text-center text-muted-foreground text-xs bg-muted/20 border-dashed border-border shadow-xs">
          <AppIcons.runs className="w-8 h-8 mx-auto mb-2 text-primary opacity-60" />
          <p className="font-medium text-foreground">Select a run from the history or submit a query on Copilot</p>
          <p className="text-[11px] mt-1 text-muted-foreground">
            Traces visualize dense candidates, FTS candidates, RRF fusion, and per-token pricing.
          </p>
        </Card>
      )}
    </div>
  );
}
