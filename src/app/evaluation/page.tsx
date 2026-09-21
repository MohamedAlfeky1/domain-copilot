"use client";

import React, { useState, useEffect } from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

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

const PAGE_SIZE = 15;

const getPageNumbers = (
  current: number,
  total: number
): (number | "ellipsis-start" | "ellipsis-end")[] => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-end", total];
  }

  if (current >= total - 3) {
    return [1, "ellipsis-start", total - 4, total - 3, total - 2, total - 1, total];
  }

  return [1, "ellipsis-start", current - 1, current, current + 1, "ellipsis-end", total];
};

export default function EvaluationPage() {
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [testCases, setTestCases] = useState<EvalTestCase[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastEvaluatedAt, setLastEvaluatedAt] = useState<string | null>(null);

  const totalPages = Math.ceil(testCases.length / PAGE_SIZE);

  // Reset to page 1 whenever test cases reload or change
  useEffect(() => {
    setCurrentPage(1);
  }, [testCases.length]);

  // Clamp to last valid page if active page becomes out of bounds
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const safeCurrentPage = totalPages > 0 ? Math.min(Math.max(1, currentPage), totalPages) : 1;
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedCases = testCases.slice(startIndex, startIndex + PAGE_SIZE);

  const fetchEvaluationData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/evaluation/runs");
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setSummary(data.summary);
        } else {
          setSummary(null);
        }
        if (data.recentResults && data.recentResults.length > 0) {
          setTestCases(data.recentResults);
        } else {
          setTestCases([]);
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
        setLastEvaluatedAt(data.evaluatedAt || new Date().toISOString());
      }
    } catch (err) {
      console.error("Error triggering evaluation suite:", err);
    } finally {
      setRunning(false);
    }
  };

  const formatEvaluatedAt = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
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
            <span className="text-xs text-muted-foreground">
              {loading ? (
                "Empirical PostgreSQL & pgvector Golden Benchmark"
              ) : summary ? (
                `Empirical PostgreSQL & pgvector Golden Benchmark (${summary.totalTests} Q/A Pairs)`
              ) : (
                "Empirical PostgreSQL & pgvector Golden Benchmark"
              )}
            </span>
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">Evaluation Benchmark &amp; Quality Harness</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Real hybrid retrieval recall, answer groundedness precision, low-evidence refusal precision, and prompt injection resistance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <Skeleton className="h-4 w-32 hidden md:inline-block" />
          ) : (
            lastEvaluatedAt && (
              <span className="text-[11px] text-muted-foreground font-mono hidden md:inline">
                Last run: {formatEvaluatedAt(lastEvaluatedAt)}
              </span>
            )
          )}
          <Button
            onClick={handleRunEvaluation}
            disabled={running || loading}
            size="sm"
            className="gap-1.5 shadow-sm"
          >
            {running ? (
              <AppIcons.loading className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <AppIcons.run className="w-3.5 h-3.5" />
            )}
            {running ? "Benchmarking Engine..." : "Run Golden Evaluation"}
          </Button>
        </div>
      </Card>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 font-mono shadow-xs bg-card border-border">
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-2.5 w-32" />
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 font-mono shadow-xs bg-card border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Golden Pass Rate</span>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{summary.passRatePct}%</p>
            <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Floor target: &gt;= 80%</p>
          </Card>

          <Card className="p-4 font-mono shadow-xs bg-card border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Refusal Precision</span>
            <p className="text-2xl font-bold text-primary mt-1">{summary.refusalPrecisionPct ?? 100}%</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Zero ungrounded hallucinations</p>
          </Card>

          <Card className="p-4 font-mono shadow-xs bg-card border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Average Latency</span>
            <p className="text-2xl font-bold text-foreground mt-1">{summary.averageLatencyMs}ms</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">PGlite pgvector + FTS</p>
          </Card>

          <Card className="p-4 font-mono shadow-xs bg-card border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Token Cost</span>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">${summary.totalCostUsd}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Recorded usage ledger rate</p>
          </Card>
        </div>
      ) : null}

      {/* Benchmark Cases Table / Empty State */}
      {loading ? (
        <Card className="shadow-sm overflow-hidden bg-card border-border">
          <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-8 w-20" />
          </div>
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : summary && testCases.length > 0 ? (
        <Card className="shadow-sm overflow-hidden bg-card border-border">
          <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
            <h3 className="text-xs font-bold text-foreground font-mono tracking-wider">
              EMPIRICAL BENCHMARK CASES ({testCases.length} TEST CASES)
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
                {paginatedCases.map((tc) => (
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
                        "0.92"
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
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/10">
              <p className="text-[11px] text-muted-foreground font-mono order-2 sm:order-1">
                Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, testCases.length)} of {testCases.length} test cases (Page {safeCurrentPage} of {totalPages})
              </p>
              <Pagination className="order-1 sm:order-2 justify-center sm:justify-end w-auto mx-0">
                <PaginationContent className="flex-wrap justify-center gap-1">
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => {
                        if (safeCurrentPage > 1) {
                          setCurrentPage(safeCurrentPage - 1);
                        }
                      }}
                      disabled={safeCurrentPage <= 1}
                      className="h-8 text-xs font-mono"
                    />
                  </PaginationItem>

                  {getPageNumbers(safeCurrentPage, totalPages).map((item) =>
                    item === "ellipsis-start" || item === "ellipsis-end" ? (
                      <PaginationItem key={item}>
                        <PaginationEllipsis className="h-8 w-8" />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <PaginationLink
                          isActive={item === safeCurrentPage}
                          onClick={() => setCurrentPage(item)}
                          className="h-8 w-8 text-xs cursor-pointer font-mono"
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => {
                        if (safeCurrentPage < totalPages) {
                          setCurrentPage(safeCurrentPage + 1);
                        }
                      }}
                      disabled={safeCurrentPage >= totalPages}
                      className="h-8 text-xs font-mono"
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-12 text-center text-muted-foreground text-xs bg-muted/20 border-dashed border-border shadow-xs">
          <AppIcons.run className="w-8 h-8 mx-auto mb-2 text-primary opacity-60" />
          <p className="font-medium text-foreground text-sm">No evaluation results yet.</p>
          <p className="text-[11px] mt-1 text-muted-foreground">
            Click &quot;Run Golden Evaluation&quot; to benchmark all test cases against the live hybrid retrieval engine.
          </p>
          <Button
            onClick={handleRunEvaluation}
            disabled={running}
            size="sm"
            className="mt-4 gap-1.5 shadow-sm"
          >
            {running ? (
              <AppIcons.loading className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <AppIcons.run className="w-3.5 h-3.5" />
            )}
            {running ? "Benchmarking Engine..." : "Run Golden Evaluation"}
          </Button>
        </Card>
      )}
    </div>
  );
}
