import React, { useState } from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ChunkData {
  id: string;
  chunkIndex: number;
  section?: string;
  page?: number;
  clause?: string;
  text: string;
  tokenCount: number;
  metadata?: any;
}

interface ChunkDrawerProps {
  document: {
    id: string;
    name: string;
    contentHash?: string;
  } | null;
  chunks: ChunkData[];
  loading?: boolean;
  onClose: () => void;
}

export function ChunkDrawer({
  document,
  chunks,
  loading = false,
  onClose,
}: ChunkDrawerProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!document) return null;

  const handleCopyChunkText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-card border-l border-border h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-border bg-muted/40 flex items-center justify-between">
          <div className="overflow-hidden">
            <div className="flex items-center gap-2 mb-0.5">
              <Badge variant="info" className="text-[10px] font-mono uppercase">
                CHUNK INSPECTOR
              </Badge>
              <span className="text-[11px] font-mono text-muted-foreground">
                SHA: {document.contentHash?.slice(0, 12)}...
              </span>
            </div>
            <h3 className="text-sm font-bold text-foreground truncate max-w-md" title={document.name}>
              {document.name}
            </h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              Extracted pgvector Chunks ({chunks.length})
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Close Chunk Inspector"
          >
            <AppIcons.close className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/10">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-xs font-mono">
              Loading vector chunks...
            </div>
          ) : chunks.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs font-sans">
              No chunks extracted for this document version.
            </div>
          ) : (
            chunks.map((chunk, idx) => (
              <Card key={chunk.id} className="p-4 bg-card border-border shadow-xs space-y-2.5">
                {/* Chunk Header */}
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-mono text-muted-foreground border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-[10px]">
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-foreground">
                      {chunk.section || `Chunk ${chunk.chunkIndex}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
                      Page {chunk.page || 1}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
                      {chunk.tokenCount} tokens
                    </span>
                    <button
                      onClick={() => handleCopyChunkText(chunk.id, chunk.text)}
                      title="Copy Chunk Text"
                      aria-label="Copy Chunk Text"
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {copiedId === chunk.id ? (
                        <AppIcons.check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <AppIcons.copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Chunk Text Content */}
                <div className="bg-muted/30 p-3 rounded-md font-mono text-xs text-foreground leading-relaxed whitespace-pre-wrap border border-border/80">
                  {chunk.text}
                </div>

                {/* Chunk ID */}
                <div className="text-[10px] font-mono text-muted-foreground truncate">
                  ID: <span className="text-foreground">{chunk.id}</span>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
