"use client";

import React, { useState, useEffect } from "react";
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

interface EvalSummary {
  totalTests: number;
  passed: number;
  failed: number;
  passRatePct: number;
  averageLatencyMs: number;
  totalCostUsd: number;
  retrievalRecallPct?: number;
  refusalPrecisionPct?: number;
}

interface EvalTestCase {
  id: string;
  category: string;
  question: string;
  latencyMs: number;
  costUsd: number;
  pass: boolean;
  groundednessScore: number;
  refusalTriggered?: boolean;
}

export default function EvaluationPage() {
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [testCases, setTestCases] = useState<EvalTestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(null);

  const fetchEvaluationData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/evaluation/runs");
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setSummary(data.summary);
        }
        if (data.recentResults && data.recentResults.length > 0) {
          setTestCases(data.recentResults);
        }
        if (data.evaluatedAt) {
          setLastEvaluatedAt(data.evaluatedAt);
        }
      }
    } catch (err) {
      console.error("Failed to load evaluation benchmark results:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluationData();
  }, []);

  const handleRunEvaluation = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/evaluation/runs", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setSummary(data.summary);
        }
        if (data.recentResults && data.recentResults.length > 0) {
          setTestCases(data.recentResults);
        }
        if (data.evaluatedAt) {
          setLastEvaluatedAt(data.evaluatedAt);
        }
      }
    } catch (err) {
      console.error("Error synchronizing evaluation baseline:", err);
    } finally {
      setRunning(false);
    }
  };

  const formatCost = (val: number | null | undefined) => {
    if (val == null || isNaN(val)) return "—";
    return `$${Number(val).toFixed(5)}`;
  };

  const formatLatency = (val: number | null | undefined) => {
    if (val == null || isNaN(val)) return "—";
    return `${val}ms`;
  };

  const formatPct = (val: number | null | undefined) => {
    if (val == null || isNaN(val)) return "—";
    return `${val}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm bg-card border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="purple" className="text-[11px] font-mono uppercase">
              BENCHMARK HARNESS
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
              EMPIRICAL BASELINE FIXTURE
            </Badge>
            <span className="text-xs text-muted-foreground">
              Empirical PostgreSQL &amp; pgvector Golden Benchmark ({summary ? `${summary.totalTests} Q/A Pairs` : "33 Q/A Pairs"})
            </span>
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">Evaluation Benchmark &amp; Quality Harness</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Real hybrid retrieval recall, answer groundedness precision, low-evidence refusal precision, and prompt injection resistance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastEvaluatedAt && (
            <span className="text-[11px] text-muted-foreground font-mono hidden md:inline">
              Baseline: {new Date(lastEvaluatedAt).toLocaleDateString()}
            </span>
          )}
          <Button
            onClick={handleRunEvaluation}
            disabled={running}
            size="sm"
            className="gap-1.5 shadow-sm"
          >
            {running ? (
              <AppIcons.loading className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <AppIcons.run className="w-3.5 h-3.5" />
            )}
            {running ? "Syncing Baseline..." : "Sync Baseline Benchmark"}
          </Button>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <Card className="p-4 font-mono shadow-xs bg-card border-border">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Golden Pass Rate</span>
          {loading && !summary ? (
            <div className="h-8 w-20 bg-muted animate-pulse rounded mt-1" />
          ) : (
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {formatPct(summary?.passRatePct)}
            </p>
          )}
          <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Floor target: &gt;= 80%</p>
        </Card>

        <Card className="p-4 font-mono shadow-xs bg-card border-border">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Retrieval Recall</span>
          {loading && !summary ? (
            <div className="h-8 w-20 bg-muted animate-pulse rounded mt-1" />
          ) : (
            <p className="text-2xl font-bold text-primary mt-1">
              {formatPct(summary?.retrievalRecallPct)}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">Top-5 hybrid recall</p>
        </Card>

        <Card className="p-4 font-mono shadow-xs bg-card border-border">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Refusal Precision</span>
          {loading && !summary ? (
            <div className="h-8 w-20 bg-muted animate-pulse rounded mt-1" />
          ) : (
            <p className="text-2xl font-bold text-primary mt-1">
              {formatPct(summary?.refusalPrecisionPct)}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">Zero ungrounded hallucinations</p>
        </Card>

        <Card className="p-4 font-mono shadow-xs bg-card border-border">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Average Latency</span>
          {loading && !summary ? (
            <div className="h-8 w-20 bg-muted animate-pulse rounded mt-1" />
          ) : (
            <p className="text-2xl font-bold text-foreground mt-1">
              {formatLatency(summary?.averageLatencyMs)}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">PGlite pgvector + FTS</p>
        </Card>

        <Card className="p-4 font-mono shadow-xs bg-card border-border">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Token Cost</span>
          {loading && !summary ? (
            <div className="h-8 w-24 bg-muted animate-pulse rounded mt-1" />
          ) : (
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
              {formatCost(summary?.totalCostUsd)}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">Recorded usage ledger rate</p>
        </Card>
      </div>

      {/* Benchmark Cases Table */}
      <Card className="shadow-sm overflow-hidden bg-card border-border">
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <h3 className="text-xs font-bold text-foreground font-mono tracking-wider">
            EMPIRICAL BENCHMARK CASES ({testCases.length > 0 ? testCases.length : (summary?.totalTests ?? 33)} TEST CASES)
          </h3>
          <Button
            onClick={fetchEvaluationData}
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground text-xs font-mono h-8 px-2 gap-1.5"
            aria-label="Refresh benchmark test cases"
          >
            <AppIcons.refresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40 font-mono uppercase text-[10px]">
              <TableRow>
                <TableHead className="py-3 px-4">Test ID</TableHead>
                <TableHead className="py-3 px-4">Category</TableHead>
                <TableHead className="py-3 px-4">Question</TableHead>
                <TableHead className="py-3 px-4">Groundedness</TableHead>
                <TableHead className="py-3 px-4">Latency</TableHead>
                <TableHead className="py-3 px-4 text-right">Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs font-mono">
              {testCases.length > 0 ? (
                testCases.map((tc) => (
                  <TableRow key={tc.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="py-3 px-4 font-bold text-primary">{tc.id}</TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge
                        variant={
                          tc.category === "GROUNDED"
                            ? "info"
                            : tc.category.includes("INJECTION")
                            ? "destructive"
                            : "warning"
                        }
                        className="text-[10px] font-bold"
                      >
                        {tc.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-foreground font-sans max-w-md truncate">
                      {tc.question}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-foreground">
                      {tc.groundednessScore !== undefined ? (
                        <span
                          className={
                            tc.groundednessScore >= 0.8
                              ? "text-emerald-600 dark:text-emerald-400 font-bold"
                              : "text-amber-600 dark:text-amber-400 font-bold"
                          }
                        >
                          {tc.groundednessScore.toFixed(2)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-muted-foreground">{tc.latencyMs}ms</TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      {tc.pass ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                          <AppIcons.success className="w-3.5 h-3.5" />
                          PASSED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive text-[11px] font-bold">
                          <AppIcons.error className="w-3.5 h-3.5" />
                          FAILED
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground font-sans">
                    {loading
                      ? "Loading empirical benchmark test cases..."
                      : "Click \"Sync Baseline Benchmark\" to load and audit all 33 empirical test cases against the hybrid retrieval engine."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
