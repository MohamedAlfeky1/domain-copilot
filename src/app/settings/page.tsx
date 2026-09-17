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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  const [domainId, setDomainId] = useState("D0_HEALTHCARE");
  const [twistId, setTwistId] = useState("T1_BILINGUAL_AR_EN");
  const [model, setModel] = useState("google/gemma-4-31b-it:free");
  const [embeddingModel, setEmbeddingModel] = useState("models/gemini-embedding-001");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <Card className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm bg-card border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-[11px] font-mono uppercase">
              SYSTEM CONFIGURATION
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">Variant Lock &amp; Provider Settings</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Configure assigned Assessment Variant gates, LLM provider endpoints, and pgvector thresholds.
          </p>
        </div>

        <Button
          onClick={handleSave}
          size="sm"
          className="self-start md:self-auto font-semibold shadow-sm"
        >
          {saved ? "Saved Configuration!" : "Save Settings"}
        </Button>
      </Card>

      {/* Variant Safety Gate Section */}
      <Card className="p-5 space-y-4 shadow-sm bg-card border-border">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground font-mono">
          <Lock className="w-4 h-4 text-primary" />
          <span>VARIANT SAFETY GATE (ASSESSMENT LOCK)</span>
        </div>
        <p className="text-xs text-muted-foreground leading-normal">
          The ITI brief mandates that the invitation email determines both Domain ($D_n$) and Twist ($T_n$).
          Building the wrong variant invalidates the submission. Placeholders like &quot;D&lt;n&gt;&quot; fail fast at boot.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-foreground font-semibold">Assigned Domain (D&lt;n&gt;):</label>
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="w-full bg-background border border-input rounded-md p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring font-mono transition-colors"
            >
              <option value="D0_HEALTHCARE">D0: Clinical Protocol &amp; Drug Safety</option>
              <option value="D2_FINANCIAL">D2: Corporate Audit &amp; Credit Risk</option>
              <option value="D3_LEGAL">D3: Statutory &amp; Contract Governance</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-foreground font-semibold">Mandatory Twist (T&lt;n&gt;):</label>
            <select
              value={twistId}
              onChange={(e) => setTwistId(e.target.value)}
              className="w-full bg-background border border-input rounded-md p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring font-mono transition-colors"
            >
              <option value="T1_BILINGUAL_AR_EN">T1: Bilingual Arabic + English</option>
              <option value="T2_CONFIDENCE_CALIBRATION">T2: Calibrated Uncertainty Index</option>
            </select>
          </div>
        </div>
      </Card>

      {/* AI Provider Configuration */}
      <Card className="p-5 space-y-4 shadow-sm bg-card border-border">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground font-mono">
          <Cpu className="w-4 h-4 text-primary" />
          <span>AI &amp; LLM PROVIDER CONFIGURATION</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-foreground font-semibold">LLM Completion Model:</label>
            <Input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">Configured active OpenRouter / LLM model</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-foreground font-semibold">Embedding Model:</label>
            <Input
              type="text"
              value={embeddingModel}
              onChange={(e) => setEmbeddingModel(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">1536-dimensional normalized vector embeddings</p>
          </div>
        </div>
      </Card>

      {/* System Health Check Endpoints */}
      <Card className="p-5 space-y-3 shadow-sm bg-card border-border">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground font-mono">
          <Database className="w-4 h-4 text-primary" />
          <span>SYSTEM READINESS &amp; HEALTH</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-center justify-between">
            <span className="text-muted-foreground">Liveness Route:</span>
            <a href="/healthz" target="_blank" className="text-primary hover:underline font-semibold">
              GET /healthz
            </a>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-center justify-between">
            <span className="text-muted-foreground">Readiness Route:</span>
            <a href="/readyz" target="_blank" className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold">
              GET /readyz
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
