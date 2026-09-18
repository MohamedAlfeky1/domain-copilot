"use client";

import React from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CorpusEmptyStateProps {
  onUploadClick: () => void;
  uploading?: boolean;
}

export function CorpusEmptyState({ onUploadClick, uploading = false }: CorpusEmptyStateProps) {
  return (
    <Card className="p-8 md:p-12 bg-card border-border shadow-xs text-center flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
        <AppIcons.corpus className="w-6 h-6" />
      </div>

      <div className="space-y-1.5 max-w-md">
        <h3 className="text-lg font-bold text-foreground tracking-tight">
          No Documents in Knowledge Corpus
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The knowledge corpus is currently unpopulated. Ingest standard clinical guidelines or operational protocols (.pdf, .docx, .txt) to initialize deterministic text extraction, chunking, and 1536d Gemini vector indexing.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Badge variant="secondary" className="font-mono text-[10px]">
          Target Domain: D0_HEALTHCARE
        </Badge>
        <Badge variant="secondary" className="font-mono text-[10px]">
          Target Twist: T1_BILINGUAL_AR_EN
        </Badge>
        <Badge variant="secondary" className="font-mono text-[10px]">
          Vector Size: 1536d
        </Badge>
      </div>

      <div className="pt-3">
        <Button
          onClick={onUploadClick}
          disabled={uploading}
          size="sm"
          className="gap-2 font-semibold shadow-xs"
        >
          <AppIcons.upload className="w-4 h-4" />
          <span>{uploading ? "Ingesting..." : "Upload Clinical Protocol"}</span>
        </Button>
      </div>
    </Card>
  );
}
