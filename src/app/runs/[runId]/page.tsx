"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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
} from "lucide-react";

export default function RunTracePage() {
  const params = useParams();
  const runId = (params?.runId as string) || "latest";

  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [usage, setUsage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRuns = async () => {
      try {
        setLoading(true);
        // Get list of recent runs
        const listRes = await fetch("/api/evaluation/runs");
        // Or if runId is specified, fetch details
        if (runId && runId !== "latest") {
          const res = await fetch(`/api/runs/${runId}`);
          if (res.ok) {
            const data = await res.json();
            setSelectedRun(data.run);
            setSteps(data.steps || []);
            setUsage(data.usage || []);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, [runId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/20 text-cyan-400 font-semibold uppercase">
              EPIC 07
            </span>
            <span className="text-xs text-slate-400">7 Stories · Traceability &amp; Cost Ledger</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Trace &amp; Metrics Inspector</h2>
          <p className="text-xs text-slate-400 mt-1">
            Nested timeline for retrieval, agents, tools, approvals and LLM calls with correlation ID propagation.
          </p>
        </div>

        <div className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 font-mono text-xs text-slate-300">
          Run ID: <strong className="text-sky-400">{runId}</strong>
        </div>
      </div>

      {selectedRun ? (
        <div className="space-y-5">
          {/* Run Header KPIs */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono">
              <span className="text-[10px] text-slate-500 uppercase">Correlation ID</span>
              <p className="text-xs text-slate-200 truncate mt-1">{selectedRun.correlationId}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono">
              <span className="text-[10px] text-slate-500 uppercase">Execution Status</span>
              <p className="text-xs text-emerald-400 font-bold mt-1">{selectedRun.status}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono">
              <span className="text-[10px] text-slate-500 uppercase">Model</span>
              <p className="text-xs text-sky-400 font-bold mt-1">gpt-4o</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 font-mono">
              <span className="text-[10px] text-slate-500 uppercase">Total Tokens / Cost</span>
              <p className="text-xs text-emerald-400 font-bold mt-1">
                {usage.reduce((acc, u) => acc + u.totalTokens, 0)} tok / $
                {usage.reduce((acc, u) => acc + u.costUsd, 0).toFixed(5)}
              </p>
            </div>
          </div>

          {/* Waterfall Steps Timeline */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-white font-mono mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              EXECUTION WATERFALL TIMELINE ({steps.length} SPANS)
            </h3>

            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded bg-slate-800 text-sky-400 flex items-center justify-center font-bold text-[11px]">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-white">{step.agent || step.stepType}</p>
                      <p className="text-[10px] text-slate-500">TYPE: {step.stepType}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-[11px] text-slate-400">
                      {step.latencyMs ? `${step.latencyMs}ms` : "< 100ms"}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px]">
                      {step.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center text-slate-500 text-xs">
          <Activity className="w-8 h-8 mx-auto mb-2 text-sky-400 opacity-40" />
          <p className="font-medium text-slate-400">No specific run trace loaded</p>
          <p className="text-[10px] mt-1 text-slate-600">
            Submit a query in the Copilot Workspace to observe real-time trace instrumentation and cost accounting.
          </p>
        </div>
      )}
    </div>
  );
}
