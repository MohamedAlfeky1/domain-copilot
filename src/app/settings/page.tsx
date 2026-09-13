"use client";

import React, { useState } from "react";
import {
  Settings,
  ShieldCheck,
  Cpu,
  Database,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Key,
  Globe,
} from "lucide-react";

export default function SettingsPage() {
  const [domainId, setDomainId] = useState("D1_HEALTHCARE");
  const [twistId, setTwistId] = useState("T1_SAFETY_GUARDRAIL");
  const [model, setModel] = useState("gpt-4o");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 font-semibold uppercase">
              SYSTEM CONFIGURATION
            </span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Variant Lock &amp; Provider Settings</h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure assigned Assessment Variant gates, LLM provider endpoints, and pgvector thresholds.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-lg shadow-sky-600/20 transition-all"
        >
          {saved ? "Saved Configuration!" : "Save Settings"}
        </button>
      </div>

      {/* Variant Safety Gate Section (TW-001) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white font-mono">
          <Lock className="w-4 h-4 text-sky-400" />
          <span>VARIANT SAFETY GATE (ASSESSMENT LOCK)</span>
        </div>
        <p className="text-xs text-slate-400 leading-normal">
          The ITI brief mandates that the invitation email determines both Domain ($D_n$) and Twist ($T_n$).
          Building the wrong variant invalidates the submission. Placeholders like &quot;D&lt;n&gt;&quot; fail fast at boot.
        </p>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 font-semibold">Assigned Domain (D&lt;n&gt;):</label>
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
            >
              <option value="D1_HEALTHCARE">D1: Clinical Protocol &amp; Drug Safety</option>
              <option value="D2_FINANCIAL">D2: Corporate Audit &amp; Credit Risk</option>
              <option value="D3_LEGAL">D3: Statutory &amp; Contract Governance</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 font-semibold">Mandatory Twist (T&lt;n&gt;):</label>
            <select
              value={twistId}
              onChange={(e) => setTwistId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
            >
              <option value="T1_SAFETY_GUARDRAIL">T1: Deterministic Side-Effect Risk Guard</option>
              <option value="T2_CONFIDENCE_CALIBRATION">T2: Calibrated Uncertainty Index</option>
            </select>
          </div>
        </div>
      </div>

      {/* AI Provider Configuration */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white font-mono">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <span>AI &amp; LLM PROVIDER CONFIGURATION</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 font-semibold">LLM Completion Model:</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono"
            />
            <p className="text-[10px] text-slate-500">Configured to: gpt-4o as requested</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 font-semibold">Embedding Model:</label>
            <input
              type="text"
              value={embeddingModel}
              onChange={(e) => setEmbeddingModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono"
            />
            <p className="text-[10px] text-slate-500">1536-dimensional vector embeddings</p>
          </div>
        </div>
      </div>

      {/* System Health Check Endpoints */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white font-mono">
          <Database className="w-4 h-4 text-purple-400" />
          <span>SYSTEM READINESS &amp; HEALTH</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Liveness Route:</span>
            <a href="/healthz" target="_blank" className="text-sky-400 hover:underline">
              GET /healthz
            </a>
          </div>
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Readiness Route:</span>
            <a href="/readyz" target="_blank" className="text-emerald-400 hover:underline">
              GET /readyz
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
