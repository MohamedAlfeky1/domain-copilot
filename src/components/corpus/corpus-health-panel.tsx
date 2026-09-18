"use client";

import React from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CorpusHealthPanelProps {
  readyStatus: "READY" | "UNHEALTHY" | "CHECKING";
  lastIngestionAt?: string | null;
  totalChunks: number;
  dbLatencyMs?: number;
  pgvectorStatus?: string;
  isUploading?: boolean;
}

export function CorpusHealthPanel({
  readyStatus,
  lastIngestionAt,
  totalChunks,
  dbLatencyMs,
  pgvectorStatus = "AVAILABLE",
  isUploading = false,
}: CorpusHealthPanelProps) {
  const formattedLastIngestion = lastIngestionAt
    ? new Date(lastIngestionAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "None (Awaiting First Document)";

  return (
    <Card className="p-5 bg-card border-border shadow-xs flex flex-col justify-between h-full space-y-4">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-xs font-bold text-foreground font-mono uppercase tracking-wider">
            Corpus Health &amp; Runtime Status
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Vector database and embedding model parameters.
          </p>
        </div>
        <Badge
          variant={
            readyStatus === "READY" ? "success" : readyStatus === "UNHEALTHY" ? "destructive" : "secondary"
          }
          className="font-mono text-[9px] uppercase font-bold gap-1"
        >
          {readyStatus === "READY" ? (
            <>
              <AppIcons.success className="w-2.5 h-2.5" />
              Healthy
            </>
          ) : readyStatus === "UNHEALTHY" ? (
            <>
              <AppIcons.warning className="w-2.5 h-2.5" />
              Attention Required
            </>
          ) : (
            <>
              <AppIcons.loading className="w-2.5 h-2.5 animate-spin" />
              Checking
            </>
          )}
        </Badge>
      </div>

      {/* Clean Key-Value Technical Grid */}
      <div className="divide-y divide-border/60 text-xs font-mono">
        {/* 1. Pipeline Status */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-muted-foreground font-sans text-xs">
            Pipeline Status
          </span>
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            {isUploading ? (
              <span className="text-primary animate-pulse flex items-center gap-1">
                <AppIcons.loading className="w-3 h-3 animate-spin" />
                Ingestion Active
              </span>
            ) : readyStatus === "READY" ? (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                Normal / Operational
              </span>
            ) : (
              <span className="text-destructive flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
                Service Degradation
              </span>
            )}
          </span>
        </div>

        {/* 2. Last Ingestion */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-muted-foreground font-sans text-xs">
            Last Ingestion
          </span>
          <span className="font-semibold text-foreground truncate max-w-[200px] text-right" title={formattedLastIngestion}>
            {formattedLastIngestion}
          </span>
        </div>

        {/* 3. Embedding Model */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-muted-foreground font-sans text-xs">
            Embedding Model
          </span>
          <span className="font-bold text-foreground">models/gemini-embedding-001</span>
        </div>

        {/* 4. Vector Dimensions */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-muted-foreground font-sans text-xs">
            Vector Dimensions
          </span>
          <span className="font-bold text-foreground">1536 Float32 (Normalized)</span>
        </div>

        {/* 5. Vector Store */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-muted-foreground font-sans text-xs">
            Vector Store
          </span>
          <span className="font-bold text-foreground">
            pgvector ({pgvectorStatus}) · {dbLatencyMs !== undefined ? `${dbLatencyMs}ms` : "PGlite"}
          </span>
        </div>

        {/* 6. Indexed Vectors */}
        <div className="py-2.5 flex items-center justify-between">
          <span className="text-muted-foreground font-sans text-xs">
            Indexed Vectors
          </span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {totalChunks} Vectors Active
          </span>
        </div>
      </div>
    </Card>
  );
}
