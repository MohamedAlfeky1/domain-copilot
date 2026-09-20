import React from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface IngestionJob {
  id: string;
  stage: string;
  status: string;
  progressPct?: number;
  errorMessage?: string;
}

interface PipelineBoardProps {
  totalDocuments: number;
  totalChunks: number;
  jobs?: IngestionJob[];
  isUploading?: boolean;
  loading?: boolean;
}

const STAGES = [
  {
    step: "01",
    id: "EXTRACT",
    title: "Extract",
    description: "Multilingual PDF/TXT parsing",
    icon: AppIcons.extract,
  },
  {
    step: "02",
    id: "CLEAN",
    title: "Clean",
    description: "Whitespace & noise sanitization",
    icon: AppIcons.clean,
  },
  {
    step: "03",
    id: "CHUNK",
    title: "Chunk",
    description: "Deterministic token windowing",
    icon: AppIcons.chunk,
  },
  {
    step: "04",
    id: "EMBED",
    title: "Embed",
    description: "1536d Gemini L2 vectorization",
    icon: AppIcons.embed,
  },
  {
    step: "05",
    id: "INDEX",
    title: "Index",
    description: "Dual pgvector & FTS catalog",
    icon: AppIcons.index,
  },
];

export function PipelineBoard({
  totalDocuments,
  totalChunks,
  jobs = [],
  isUploading = false,
  loading = false,
}: PipelineBoardProps) {
  const hasDocuments = totalDocuments > 0;
  const activeJob = jobs.find((j) => j.status === "RUNNING" || j.status === "PROCESSING");

  return (
    <Card className="p-5 bg-card border-border shadow-xs flex flex-col justify-between h-full space-y-4">
      {/* Stepper Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-foreground font-mono uppercase tracking-wider">
              Ingestion Pipeline Workflow
            </h3>
            <Badge variant="secondary" className="font-mono text-[9px]">
              5 PHASES
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Deterministic sequence from raw document ingestion to dual-index retrieval readiness.
          </p>
        </div>

        <div>
          {loading ? (
            <Skeleton className="h-5 w-28 rounded-full" />
          ) : isUploading ? (
            <Badge variant="info" className="gap-1 animate-pulse font-mono text-[10px]">
              <AppIcons.loading className="w-3 h-3 animate-spin" />
              Ingesting Active Payload
            </Badge>
          ) : hasDocuments ? (
            <Badge variant="success" className="gap-1 font-mono text-[10px]">
              <AppIcons.success className="w-3 h-3" />
              Pipeline Complete
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground font-mono text-[10px]">
              <AppIcons.pending className="w-3 h-3" />
              Awaiting Ingestion
            </Badge>
          )}
        </div>
      </div>

      {/* Visual Stepper: 01 Extract → 02 Clean → 03 Chunk → 04 Embed → 05 Index */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 relative items-stretch">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isComplete = hasDocuments && !isUploading;
          const isCurrent = isUploading && (activeJob ? activeJob.stage === stage.id : idx === 0);
          const isPending = !hasDocuments && !isUploading;

          if (loading) {
            return (
              <div key={stage.id} className="relative flex flex-col h-full justify-center">
                <div className="p-3.5 rounded-lg border border-border/60 bg-muted/10 w-full h-full flex flex-col justify-between transition-all">
                  <div className="flex flex-col flex-1">
                    {/* Top Row: Phase number on the left + icon on the right */}
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="font-mono text-[11px] font-bold text-muted-foreground/70">
                        {stage.step}
                      </span>
                      <Skeleton className="w-3.5 h-3.5 rounded" />
                    </div>

                    {/* Phase Title */}
                    <h4 className="text-xs font-bold font-mono tracking-tight text-foreground">
                      {stage.title}
                    </h4>

                    {/* Description with comfortable line-height and spacing */}
                    <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
                      {stage.description}
                    </p>

                    {/* Flexible spacer to ensure consistent height & bottom alignment */}
                    <div className="flex-1 min-h-[10px]" />
                  </div>

                  {/* Subtle Divider + Bottom Row: Vol: on the left + value on the right */}
                  <div className="pt-2 mt-3 border-t border-border/60 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-muted-foreground">Vol:</span>
                    <Skeleton className="h-3.5 w-10 rounded" />
                  </div>
                </div>

                {/* Arrow Connector on desktop between stages */}
                {idx < STAGES.length - 1 && (
                  <AppIcons.chevronRight className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 w-3.5 h-3.5 z-10 pointer-events-none" />
                )}
              </div>
            );
          }

          return (
            <div key={stage.id} className="relative flex flex-col h-full justify-center">
              <div
                className={`p-3.5 rounded-lg border w-full h-full flex flex-col justify-between transition-all ${
                  isCurrent
                    ? "bg-primary/5 border-primary shadow-xs ring-1 ring-primary/20"
                    : isComplete
                    ? "bg-muted/30 border-border/80 text-foreground"
                    : "bg-muted/10 border-border/60 opacity-60 text-muted-foreground"
                }`}
              >
                <div className="flex flex-col flex-1">
                  {/* Top Row: Phase number on the left + icon on the right */}
                  <div className="flex items-center justify-between mb-2.5">
                    <span
                      className={`font-mono text-[11px] font-bold ${
                        isCurrent
                          ? "text-primary"
                          : isComplete
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {stage.step}
                    </span>
                    <Icon
                      className={`w-3.5 h-3.5 ${
                        isCurrent
                          ? "text-primary"
                          : isComplete
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  </div>

                  {/* Phase Title */}
                  <h4 className="text-xs font-bold font-mono tracking-tight text-foreground">
                    {stage.title}
                  </h4>

                  {/* Description with comfortable line-height and spacing */}
                  <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
                    {stage.description}
                  </p>

                  {/* Flexible spacer to ensure consistent height & bottom alignment */}
                  <div className="flex-1 min-h-[10px]" />
                </div>

                {/* Subtle Divider + Bottom Row: Vol: on the left + value on the right */}
                <div className="pt-2 mt-3 border-t border-border/60 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground">Vol:</span>
                  <span className="font-bold text-foreground">
                    {isComplete
                      ? stage.id === "INDEX" || stage.id === "EMBED" || stage.id === "CHUNK"
                        ? `${totalChunks} chk`
                        : `${totalDocuments} doc`
                      : isCurrent
                      ? "Active..."
                      : "0"}
                  </span>
                </div>
              </div>

              {/* Arrow Connector on desktop between stages */}
              {idx < STAGES.length - 1 && (
                <AppIcons.chevronRight className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 w-3.5 h-3.5 z-10 pointer-events-none" />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
