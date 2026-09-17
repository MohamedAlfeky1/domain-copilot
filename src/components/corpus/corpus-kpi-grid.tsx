import React from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CorpusKpiGridProps {
  totalDocuments: number;
  totalPages: number;
  totalChunks: number;
  failureCount: number;
}

export function CorpusKpiGrid({
  totalDocuments,
  totalPages,
  totalChunks,
  failureCount,
}: CorpusKpiGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Documents */}
      <Card className="p-4 bg-card border-border shadow-xs hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between text-muted-foreground mb-1.5">
          <span className="text-[11px] font-mono uppercase font-semibold">Documents</span>
          <div className="w-8 h-8 rounded-md bg-sky-500/10 text-sky-600 flex items-center justify-center">
            <AppIcons.documents className="w-4 h-4" />
          </div>
        </div>
        <p className="text-2xl font-bold tracking-tight text-foreground font-mono">
          {totalDocuments}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1 truncate">
          {totalDocuments > 0 ? "Active in primary index" : "Corpus unpopulated"}
        </p>
      </Card>

      {/* 2. Total Pages */}
      <Card className="p-4 bg-card border-border shadow-xs hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between text-muted-foreground mb-1.5">
          <span className="text-[11px] font-mono uppercase font-semibold">Total Pages</span>
          <div className="w-8 h-8 rounded-md bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
            <AppIcons.pages className="w-4 h-4" />
          </div>
        </div>
        <p className="text-2xl font-bold tracking-tight text-foreground font-mono">
          {totalPages}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1 truncate">
          {totalPages > 0 ? "Clinical protocol pages" : "0 pages parsed"}
        </p>
      </Card>

      {/* 3. Indexed Chunks */}
      <Card className="p-4 bg-card border-border shadow-xs hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between text-muted-foreground mb-1.5">
          <span className="text-[11px] font-mono uppercase font-semibold">Indexed Chunks</span>
          <div className="w-8 h-8 rounded-md bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <AppIcons.chunks className="w-4 h-4" />
          </div>
        </div>
        <p className="text-2xl font-bold tracking-tight text-emerald-600 font-mono">
          {totalChunks}
        </p>
        <p className="text-[11px] text-emerald-700/80 mt-1 truncate font-mono">
          {totalChunks > 0 ? "1536d pgvector ready" : "0 vectors generated"}
        </p>
      </Card>

      {/* 4. Pipeline Failures */}
      <Card
        className={`p-4 bg-card border-border shadow-xs transition-colors ${
          failureCount > 0
            ? "border-destructive/40 bg-destructive/5 hover:border-destructive"
            : "hover:border-primary/40"
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1.5">
          <span className="text-[11px] font-mono uppercase font-semibold">Pipeline Failures</span>
          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center ${
              failureCount > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-500/10 text-emerald-600"
            }`}
          >
            {failureCount > 0 ? (
              <AppIcons.failures className="w-4 h-4" />
            ) : (
              <AppIcons.success className="w-4 h-4 text-emerald-600" />
            )}
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <p
            className={`text-2xl font-bold font-mono tracking-tight ${
              failureCount > 0 ? "text-destructive" : "text-foreground"
            }`}
          >
            {failureCount}
          </p>
          {failureCount === 0 && (
            <Badge variant="success" className="text-[9px] px-1.5 py-0 font-mono">
              0 ERRORS
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 truncate">
          {failureCount === 0 ? "No ingestion errors detected" : `${failureCount} unhandled error(s)`}
        </p>
      </Card>
    </div>
  );
}
