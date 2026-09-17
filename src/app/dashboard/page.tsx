"use client";

import React, { useState, useEffect } from "react";
import { AppIcons } from "@/components/ui/icons";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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

export default function DashboardPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [docChunks, setDocChunks] = useState<any[]>([]);

  const fetchCorpus = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocuments(data.documents || []);
      setJobs(data.jobs || []);
      setTotalChunks(data.totalChunksIndexed || 0);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCorpus();
    const timer = window.setInterval(fetchCorpus, 4000);
    return () => window.clearInterval(timer);
  }, []);

  const retryDocument = async (doc: any) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/reingest`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Retry failed");
      }
      await fetchCorpus();
    } catch (error: any) {
      alert(`Retry error: ${error.message}`);
    }
  };

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
        await fetchCorpus();
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
      setDocChunks(data.chunks || []);
    } catch (err) {
      console.error(err);
    }
  };

  const totalPages = documents.reduce(
    (acc, d) => acc + (d.sizeBytes ? Math.max(1, Math.ceil(d.sizeBytes / 2500)) : 1),
    0
  );
  const failureCount = documents.filter((d) => d.status === "FAILED").length;
  const selectedJob = selectedDoc
    ? jobs.find((item) => item.documentVersionId === selectedDoc.currentVersionId)
    : null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <Card className="shadow-xs">
        <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="info" className="font-mono text-[10px] font-semibold uppercase">
                KNOWLEDGE PIPELINE
              </Badge>
              <span className="text-xs text-muted-foreground">Ingestion &amp; Vector Indexing</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Knowledge Ingestion &amp; Vector Pipeline
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Extract, clean, chunk, embed, index; preserve source metadata, idempotency, and visible ingestion health.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCorpus}
              className="gap-1.5 text-xs text-slate-700"
            >
              <AppIcons.refresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <label className="inline-flex">
              <Button
                size="sm"
                className="gap-1.5 text-xs cursor-pointer shadow-xs font-semibold"
                asChild
              >
                <span>
                  <AppIcons.upload className="w-4 h-4" />
                  <span>{uploading ? "Ingesting..." : "Upload Document"}</span>
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

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="shadow-xs p-4">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span className="font-medium">Documents</span>
            <AppIcons.documents className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground">{documents.length}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Corpus inventory</p>
        </Card>

        <Card className="shadow-xs p-4">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span className="font-medium">Total Pages</span>
            <AppIcons.pages className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground">{totalPages}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Clinical guideline pages</p>
        </Card>

        <Card className="shadow-xs p-4">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span className="font-medium">Indexed Chunks</span>
            <AppIcons.chunks className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-600">{totalChunks}</p>
          <p className="text-[10px] text-emerald-700/80 mt-1">1536d pgvector ready</p>
        </Card>

        <Card className="shadow-xs p-4">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span className="font-medium">Pipeline Failures</span>
            <AppIcons.failures className={`w-4 h-4 ${failureCount > 0 ? "text-rose-500" : "text-slate-400"}`} />
          </div>
          <p className={`text-2xl font-bold font-mono ${failureCount > 0 ? "text-rose-600" : "text-foreground"}`}>
            {failureCount}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Zero unhandled errors</p>
        </Card>

        <Card className="shadow-xs p-4 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
            <span className="font-medium">Last Ingest</span>
            <AppIcons.pending className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-xs font-mono text-foreground mt-2 truncate font-medium">
            {documents.length > 0 ? new Date(documents[0].createdAt).toLocaleTimeString() : "None"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Live updates active</p>
        </Card>
      </div>

      {/* 5-Stage Ingestion Pipeline Board */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b border-border flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">
            5-Stage Ingestion Pipeline Board
          </CardTitle>
          <Badge variant="success" className="gap-1.5 font-mono text-[10px] py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            PIPELINE READY
          </Badge>
        </CardHeader>
        <CardContent className="p-4 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { stage: "Extract", desc: "PDF / DOCX / TXT text extraction", count: documents.length },
              { stage: "Clean", desc: "Boilerplate & header scrubbing", count: documents.length },
              { stage: "Chunk", desc: "Structure-aware & clause offsets", count: totalChunks },
              { stage: "Embed", desc: "gemini-embedding-001 (1536d)", count: totalChunks },
              { stage: "Index", desc: "pgvector similarity index", count: totalChunks },
            ].map((item, idx) => (
              <div
                key={item.stage}
                className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-semibold text-sky-600">0{idx + 1}</span>
                  <AppIcons.success className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">{item.stage}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{item.desc}</p>
                <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Processed:</span>
                  <span className="text-slate-700 font-semibold">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Document Inventory Table */}
      <Card className="shadow-xs overflow-hidden">
        <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold text-foreground">
              Corpus Document Inventory
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {documents.length} items
            </Badge>
          </div>
        </CardHeader>

        {documents.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <AppIcons.corpus className="w-8 h-8 mx-auto mb-2 opacity-40 text-sky-600" />
            <p className="text-sm font-medium">No documents in corpus</p>
            <p className="text-xs mt-1">Upload files to populate the knowledge base.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="py-3 px-4 font-mono text-[11px] uppercase">Document Name</TableHead>
                <TableHead className="py-3 px-4 font-mono text-[11px] uppercase">MIME / Format</TableHead>
                <TableHead className="py-3 px-4 font-mono text-[11px] uppercase">Size</TableHead>
                <TableHead className="py-3 px-4 font-mono text-[11px] uppercase">Pipeline Status</TableHead>
                <TableHead className="py-3 px-4 font-mono text-[11px] uppercase">Ingested At</TableHead>
                <TableHead className="py-3 px-4 text-right font-mono text-[11px] uppercase">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => {
                const job = jobs.find((item) => item.documentVersionId === doc.currentVersionId);
                const isFailed = doc.status === "FAILED";
                return (
                  <TableRow key={doc.id} className="hover:bg-slate-50/80">
                    <TableCell className="py-3 px-4 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <AppIcons.documents className="w-4 h-4 text-sky-600 shrink-0" />
                        <span className="truncate max-w-xs">{doc.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4 font-mono text-xs text-muted-foreground">
                      {doc.mimeType}
                    </TableCell>
                    <TableCell className="py-3 px-4 font-mono text-xs text-muted-foreground">
                      {Math.round(doc.sizeBytes / 1024)} KB
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      {isFailed ? (
                        <Badge variant="destructive" className="gap-1 font-mono text-[10px]">
                          <AppIcons.warning className="w-3 h-3" />
                          FAILED
                        </Badge>
                      ) : (
                        <Badge variant="success" className="gap-1 font-mono text-[10px]">
                          <AppIcons.success className="w-3 h-3" />
                          {job ? `${job.stage} ${job.progressPct}%` : doc.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-3 px-4 font-mono text-xs text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString()} {new Date(doc.createdAt).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => inspectDoc(doc)}
                        className="h-7 text-xs"
                      >
                        Inspect Chunks
                      </Button>
                      {isFailed && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => retryDocument(doc)}
                          className="h-7 text-xs"
                        >
                          Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Chunk Drawer Modal / Panel */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-card border-l border-border h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-border flex items-center justify-between bg-slate-50">
              <div className="overflow-hidden">
                <h3 className="text-sm font-bold text-foreground truncate max-w-md">{selectedDoc.name}</h3>
                <p className="text-xs text-sky-600 font-mono mt-0.5">
                  Extracted Chunks &amp; Vector Embeddings ({docChunks.length} chunks)
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDoc(null)}
                aria-label="Close modal"
                className="h-8 w-8 p-0 text-slate-500 hover:text-foreground"
              >
                <AppIcons.close className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
              {selectedJob?.status === "FAILED" && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  <p className="font-semibold">{selectedJob.errorCode || "INGESTION_FAILED"}</p>
                  <p className="mt-1">{selectedJob.errorMessage || "The pipeline failed without an error message."}</p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => retryDocument(selectedDoc)}
                    className="mt-2 h-7 text-xs"
                  >
                    Retry original upload
                  </Button>
                </div>
              )}
              {docChunks.map((chunk, idx) => (
                <Card key={chunk.id} className="p-3.5 shadow-xs space-y-2 border-slate-200">
                  <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                    <span className="text-sky-700 font-semibold">Chunk #{idx + 1}</span>
                    <span>Page {chunk.page || 1} · {chunk.tokenCount} tokens</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-md border border-slate-200 font-mono text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {chunk.text}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1">
                    <span>ID: {chunk.id}</span>
                    <Badge variant="success" className="font-mono text-[9px] py-0">
                      Gemini 1536d
                    </Badge>
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
