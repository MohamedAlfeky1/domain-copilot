"use client";

import React from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CorpusHealthCardProps {
  totalChunks: number;
  totalDocs: number;
  dbLatencyMs?: number;
}

export function CorpusHealthCard({
  totalChunks,
  totalDocs,
  dbLatencyMs,
}: CorpusHealthCardProps) {
  return (
    <Card className="p-5 bg-card border-border shadow-xs space-y-3">
      <div className="flex items-center justify-between border-b border-border pb-2.5">
        <div>
          <h3 className="text-xs font-bold text-foreground font-mono uppercase tracking-wider">
            Corpus Technical &amp; Vector Specifications
          </h3>
        </div>
        <Badge variant="success" className="text-[9px] font-mono">
          CONSISTENT VECTOR SPACE
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
        {/* 1. Model */}
        <div className="p-2.5 rounded-md bg-muted/30 border border-border space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
            Embedding Model
          </span>
          <p className="font-bold text-foreground truncate" title="models/gemini-embedding-001">
            gemini-embedding-001
          </p>
        </div>

        {/* 2. Vector Dimension */}
        <div className="p-2.5 rounded-md bg-muted/30 border border-border space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
            Vector Dimension
          </span>
          <p className="font-bold text-foreground">1536 Float32</p>
        </div>

        {/* 3. Normalization */}
        <div className="p-2.5 rounded-md bg-muted/30 border border-border space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
            L2 Normalization
          </span>
          <p className="font-bold text-emerald-600 dark:text-emerald-400">Unit L2 (||v|| = 1.0)</p>
        </div>

        {/* 4. Dense Vector Index */}
        <div className="p-2.5 rounded-md bg-muted/30 border border-border space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
            Dense Search
          </span>
          <p className="font-bold text-foreground truncate">pgvector (&lt;=&gt; Cosine)</p>
        </div>

        {/* 5. Sparse Keyword Index */}
        <div className="p-2.5 rounded-md bg-muted/30 border border-border space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
            Sparse Search
          </span>
          <p className="font-bold text-indigo-600 dark:text-indigo-400 truncate">
            PostgreSQL FTS (ts_rank_cd)
          </p>
        </div>

        {/* 6. Version Isolation */}
        <div className="p-2.5 rounded-md bg-muted/30 border border-border space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
            Version Scope
          </span>
          <p className="font-bold text-foreground">Active Versions Only</p>
        </div>
      </div>
    </Card>
  );
}
