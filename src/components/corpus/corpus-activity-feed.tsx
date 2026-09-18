import React from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ActivityItem {
  id: string;
  type: "INDEXED" | "INGESTED" | "FAILED";
  title: string;
  documentName: string;
  timestamp: string;
}

interface CorpusActivityFeedProps {
  documents: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
  }>;
}

export function CorpusActivityFeed({ documents }: CorpusActivityFeedProps) {
  // Synthesize real events from documents array sorted by createdAt descending
  const events: ActivityItem[] = [...documents]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      type: d.status === "INDEXED" || d.status === "COMPLETED" ? "INDEXED" : d.status === "FAILED" ? "FAILED" : "INGESTED",
      title: d.status === "INDEXED" ? "Document Indexed & Vectorized" : "Document Ingestion Queued",
      documentName: d.name,
      timestamp: d.createdAt,
    }));

  return (
    <Card className="p-5 bg-card border-border shadow-xs space-y-3">
      <div className="flex items-center justify-between border-b border-border pb-2.5">
        <div>
          <h3 className="text-xs font-bold text-foreground font-mono uppercase tracking-wider">
            Recent Ingestion &amp; Indexing Events
          </h3>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          {events.length} Recent
        </Badge>
      </div>

      {events.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-xs font-sans">
          <AppIcons.pending className="w-6 h-6 mx-auto mb-1 text-muted-foreground/50" />
          <p className="font-semibold text-foreground">No recent ingestion events recorded</p>
          <p className="text-[11px] text-muted-foreground">
            Activity history will populate when new clinical protocols are uploaded.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {events.map((evt) => {
            const formattedTime = new Date(evt.timestamp).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const formattedDate = new Date(evt.timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });

            return (
              <div
                key={evt.id}
                className="p-3 rounded-md bg-muted/20 border border-border flex items-center justify-between text-xs transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <AppIcons.success className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-foreground font-mono text-xs">{evt.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate" title={evt.documentName}>
                      {evt.documentName}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {formattedDate} · {formattedTime}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
