"use client";

import React, { useState, useEffect } from "react";
import {
  Database,
  UploadCloud,
  FileText,
  CheckCircle2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export default function CorpusPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [chunks, setChunks] = useState<any[]>([]);

  const fetchDocs = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocuments(data.documents || []);
      setTotalChunks(data.totalChunksIndexed || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        await fetchDocs();
      } else {
        const err = await res.json();
        alert(`Upload error: ${err.error}`);
      }
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const inspectDoc = async (doc: any) => {
    setSelectedDoc(doc);
    try {
      const res = await fetch(`/api/documents/${doc.id}`);
      const data = await res.json();
      setChunks(data.chunks || []);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredDocs = documents.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="shadow-xs">
        <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="success" className="font-mono text-[10px] font-semibold uppercase">
                CORPUS REPOSITORY
              </Badge>
              <span className="text-xs text-muted-foreground">Deterministic Chunking &amp; Versioning</span>
            </div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">Corpus Document Library</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Explore active versions, page counts, verified checksums, and underlying pgvector chunk indices.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDocs}
              className="gap-1.5 text-xs text-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <label className="inline-flex">
              <Button
                variant="default"
                size="sm"
                className="gap-1.5 text-xs cursor-pointer bg-emerald-600 hover:bg-emerald-500 shadow-xs"
                asChild
              >
                <span>
                  <UploadCloud className="w-4 h-4" />
                  <span>{uploading ? "Ingesting..." : "Ingest Document"}</span>
                </span>
              </Button>
              <input
                type="file"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
                accept=".pdf,.docx,.txt,.md"
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents by filename or keyword..."
            className="pl-9 h-9 text-xs bg-card"
          />
        </div>
        <div className="px-3 py-2 rounded-lg bg-card border border-border font-mono text-xs text-slate-700 flex items-center justify-between sm:justify-start gap-2 shadow-xs">
          <span className="text-muted-foreground">Total Indexed Chunks:</span>
          <strong className="text-emerald-600 font-semibold">{totalChunks}</strong>
        </div>
      </div>

      {/* Documents Table */}
      <Card className="shadow-xs overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="py-3 px-4 font-mono text-[11px] uppercase">Document Title</TableHead>
              <TableHead className="py-3 px-4 font-mono text-[11px] uppercase">MIME Type</TableHead>
              <TableHead className="py-3 px-4 font-mono text-[11px] uppercase">Size</TableHead>
              <TableHead className="py-3 px-4 font-mono text-[11px] uppercase">Content Hash (SHA-256)</TableHead>
              <TableHead className="py-3 px-4 font-mono text-[11px] uppercase">Status</TableHead>
              <TableHead className="py-3 px-4 text-right font-mono text-[11px] uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No documents found matching search criteria.
                </TableCell>
              </TableRow>
            ) : (
              filteredDocs.map((doc) => (
                <TableRow key={doc.id} className="hover:bg-slate-50/80">
                  <TableCell className="py-3 px-4 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="truncate max-w-sm">{doc.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4 font-mono text-xs text-muted-foreground">
                    {doc.mimeType}
                  </TableCell>
                  <TableCell className="py-3 px-4 font-mono text-xs text-muted-foreground">
                    {Math.round(doc.sizeBytes / 1024)} KB
                  </TableCell>
                  <TableCell className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                    {doc.contentHash?.slice(0, 16)}...
                  </TableCell>
                  <TableCell className="py-3 px-4">
                    <Badge variant="success" className="gap-1 font-mono text-[10px]">
                      <CheckCircle2 className="w-3 h-3" />
                      {doc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => inspectDoc(doc)}
                      className="h-7 text-xs text-sky-700 hover:text-sky-800 border-sky-200 bg-sky-50/50 hover:bg-sky-50"
                    >
                      View Chunks
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Chunk Inspection Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-card border-l border-border h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-border bg-slate-50 flex items-center justify-between">
              <div className="overflow-hidden">
                <h3 className="text-sm font-bold text-foreground truncate max-w-md">{selectedDoc.name}</h3>
                <p className="text-xs text-emerald-600 font-mono mt-0.5">
                  Extracted Chunks ({chunks.length})
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDoc(null)}
                className="h-8 w-8 p-0 text-slate-500 hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
              {chunks.map((chunk, idx) => (
                <Card key={chunk.id} className="p-3.5 shadow-xs space-y-2 border-slate-200">
                  <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                    <span className="text-emerald-700 font-bold">Chunk #{idx + 1}</span>
                    <span>Page {chunk.page || 1} · {chunk.tokenCount} tokens</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-md font-mono text-xs text-slate-800 leading-relaxed whitespace-pre-wrap border border-slate-200">
                    {chunk.text}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
