import React, { useState } from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface DocumentItem {
  id: string;
  name: string;
  source?: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  status: string;
  createdAt: string;
  currentVersionId?: string;
}

interface DocumentInventoryProps {
  documents: DocumentItem[];
  onInspectDoc: (doc: DocumentItem) => void;
  onUploadClick?: () => void;
}

export function DocumentInventory({
  documents,
  onInspectDoc,
  onUploadClick,
}: DocumentInventoryProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [mimeFilter, setMimeFilter] = useState("ALL");
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // Filtered documents
  const filtered = documents.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(search.toLowerCase()) ||
      doc.contentHash.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "ALL" || doc.status.toUpperCase() === statusFilter.toUpperCase();

    const matchesMime =
      mimeFilter === "ALL" || doc.mimeType.toLowerCase().includes(mimeFilter.toLowerCase());

    return matchesSearch && matchesStatus && matchesMime;
  });

  return (
    <Card className="p-5 bg-card border-border shadow-xs space-y-4">
      {/* Table Header & Search Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-foreground font-mono uppercase tracking-wider">
              Document Catalog &amp; Chunk Inventory
            </h2>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {documents.length} ITEMS
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cryptographically verified clinical guidelines and operational protocol files stored in active pgvector partition.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <AppIcons.search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename or SHA..."
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 bg-background border border-input rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            aria-label="Filter documents by status"
          >
            <option value="ALL">All Statuses</option>
            <option value="INDEXED">Indexed</option>
            <option value="PROCESSING">Processing</option>
            <option value="FAILED">Failed</option>
          </select>

          <select
            value={mimeFilter}
            onChange={(e) => setMimeFilter(e.target.value)}
            className="h-8 bg-background border border-input rounded-md px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            aria-label="Filter documents by MIME type"
          >
            <option value="ALL">All Types</option>
            <option value="text/plain">Text (.txt)</option>
            <option value="application/pdf">PDF (.pdf)</option>
            <option value="docx">Word (.docx)</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40 font-mono text-[10px] uppercase">
            <TableRow>
              <TableHead className="py-3 px-4">Document Title</TableHead>
              <TableHead className="py-3 px-4">Type</TableHead>
              <TableHead className="py-3 px-4">Size</TableHead>
              <TableHead className="py-3 px-4">SHA-256 Hash</TableHead>
              <TableHead className="py-3 px-4">Status</TableHead>
              <TableHead className="py-3 px-4">Ingested</TableHead>
              <TableHead className="py-3 px-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-xs font-mono">
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground font-sans">
                  {documents.length === 0 ? (
                    <div className="space-y-2">
                      <p className="font-semibold text-foreground">No documents in corpus</p>
                      <p className="text-xs text-muted-foreground">
                        Upload clinical protocol documents to initialize the vector database.
                      </p>
                    </div>
                  ) : (
                    <p>No documents match the active filter criteria.</p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((doc) => {
                const formattedDate = new Date(doc.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                return (
                  <TableRow key={doc.id} className="hover:bg-muted/30 transition-colors">
                    {/* Title */}
                    <TableCell className="py-3 px-4 font-sans font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <AppIcons.documents className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate max-w-sm" title={doc.name}>
                          {doc.name}
                        </span>
                      </div>
                    </TableCell>

                    {/* Type */}
                    <TableCell className="py-3 px-4 text-muted-foreground text-[11px]">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {doc.mimeType === "text/plain" ? "TXT" : doc.mimeType.includes("pdf") ? "PDF" : "DOCX"}
                      </Badge>
                    </TableCell>

                    {/* Size */}
                    <TableCell className="py-3 px-4 text-muted-foreground text-[11px]">
                      {Math.round(doc.sizeBytes / 1024)} KB
                    </TableCell>

                    {/* Content Hash with Copy */}
                    <TableCell className="py-3 px-4 text-muted-foreground text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{doc.contentHash?.slice(0, 12)}...</span>
                        <button
                          onClick={() => handleCopyHash(doc.contentHash)}
                          title="Copy Full SHA-256 Hash"
                          aria-label="Copy Full SHA-256 Hash"
                          className="text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary rounded p-0.5"
                        >
                          {copiedHash === doc.contentHash ? (
                            <AppIcons.check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <AppIcons.copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-3 px-4">
                      <Badge
                        variant={
                          doc.status === "INDEXED" || doc.status === "COMPLETED"
                            ? "success"
                            : doc.status === "FAILED"
                            ? "destructive"
                            : "warning"
                        }
                        className="gap-1 font-mono text-[10px]"
                      >
                        {doc.status === "INDEXED" || doc.status === "COMPLETED" ? (
                          <AppIcons.success className="w-3 h-3" />
                        ) : doc.status === "FAILED" ? (
                          <AppIcons.error className="w-3 h-3" />
                        ) : (
                          <AppIcons.loading className="w-3 h-3 animate-spin" />
                        )}
                        {doc.status}
                      </Badge>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="py-3 px-4 text-muted-foreground text-[11px]">
                      {formattedDate}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-3 px-4 text-right font-sans">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onInspectDoc(doc)}
                        className="h-7 text-xs gap-1.5"
                      >
                        <AppIcons.inspect className="w-3.5 h-3.5" />
                        <span>Inspect Chunks</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
