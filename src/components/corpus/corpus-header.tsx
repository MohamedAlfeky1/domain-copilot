"use client";

import React from "react";
import { AppIcons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface CorpusHeaderProps {
  loading: boolean;
  uploading: boolean;
  readyStatus: "READY" | "UNHEALTHY" | "CHECKING";
  onRefresh: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function CorpusHeader({
  loading,
  uploading,
  readyStatus,
  onRefresh,
  onFileUpload,
}: CorpusHeaderProps) {
  return (
    <Card className="p-6 bg-card border-border shadow-xs">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Branding & Hierarchy */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Knowledge Pipeline
            </span>
            <span className="text-muted-foreground/50">/</span>
            <Badge
              variant={readyStatus === "READY" ? "success" : readyStatus === "UNHEALTHY" ? "destructive" : "secondary"}
              className="gap-1 font-mono text-[10px] uppercase font-bold"
            >
              {readyStatus === "READY" ? (
                <>
                  <AppIcons.success className="w-3 h-3" />
                  Pipeline Healthy
                </>
              ) : readyStatus === "UNHEALTHY" ? (
                <>
                  <AppIcons.warning className="w-3 h-3" />
                  Attention Required
                </>
              ) : (
                <>
                  <AppIcons.loading className="w-3 h-3 animate-spin" />
                  Checking Readiness...
                </>
              )}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
              Deterministic Chunking &amp; Dual-Index pgvector
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Knowledge Ingestion &amp; Vector Indexing
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl leading-relaxed">
            Enterprise document ingestion pipeline enforcing deterministic content hashing (SHA-256), section-aware chunking,
            and normalized 1536-dimensional Gemini vector embeddings stored alongside PostgreSQL full-text search indexes.
          </p>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="gap-1.5 text-xs h-9 shadow-xs"
          >
            <AppIcons.refresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          <label className="inline-flex cursor-pointer">
            <Button
              size="sm"
              disabled={uploading}
              className="gap-2 text-xs h-9 shadow-xs font-semibold pointer-events-none"
              asChild
            >
              <div>
                <AppIcons.upload className={`w-4 h-4 ${uploading ? "animate-bounce" : ""}`} />
                <span>{uploading ? "Ingesting Document..." : "Upload Document"}</span>
              </div>
            </Button>
            <input
              type="file"
              onChange={onFileUpload}
              disabled={uploading}
              className="hidden"
              accept=".pdf,.docx,.txt"
              aria-label="Upload document to knowledge corpus"
            />
          </label>
        </div>
      </div>
    </Card>
  );
}
