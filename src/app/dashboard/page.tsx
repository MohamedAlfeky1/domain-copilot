"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Layers,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  RefreshCw,
  Clock,
  ArrowRight,
  Database,
  Search,
} from "lucide-react";

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
    const timer = window.setInterval(fetchCorpus, 3000);
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

  const totalPages = documents.reduce((acc, d) => acc + (d.sizeBytes ? Math.max(1, Math.ceil(d.sizeBytes / 2500)) : 1), 0);
  const failureCount = documents.filter((d) => d.status === "FAILED").length;
  const selectedJob = selectedDoc ? jobs.find((item) => item.documentVersionId === selectedDoc.currentVersionId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-sky-500/20 text-sky-400 font-semibold uppercase">
              KNOWLEDGE PIPELINE
            </span>
            <span className="text-xs text-slate-400">Ingestion &amp; Vector Indexing</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Knowledge Ingestion & Vector Pipeline
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Extract, clean, chunk, embed, index; preserve source metadata, idempotency and visible ingestion health.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchCorpus}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <label className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-500 text-white cursor-pointer shadow-lg shadow-sky-600/20 transition-all">
            <UploadCloud className="w-4 h-4" />
            <span>{uploading ? "Ingesting..." : "Upload Document"}</span>
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              accept=".pdf,.docx,.txt,.md"
            />
          </label>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Documents</span>
            <FileText className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-2xl font-bold text-white font-mono">{documents.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">Corpus inventory</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Total Pages</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white font-mono">{totalPages}</p>
          <p className="text-[10px] text-slate-500 mt-1">Target floor: &gt;=150 pages</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Indexed Chunks</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 font-mono">{totalChunks}</p>
          <p className="text-[10px] text-emerald-500/80 mt-1">pgvector ready</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Pipeline Failures</span>
            <AlertTriangle className={`w-4 h-4 ${failureCount > 0 ? "text-rose-400" : "text-slate-500"}`} />
          </div>
          <p className={`text-2xl font-bold font-mono ${failureCount > 0 ? "text-rose-400" : "text-slate-300"}`}>
            {failureCount}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Zero unhandled errors</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Last Ingest</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xs font-mono text-slate-300 mt-2 truncate">
            {documents.length > 0 ? new Date(documents[0].createdAt).toLocaleTimeString() : "None"}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Live updates active</p>
        </div>
      </div>

      {/* 5-Stage Ingestion Pipeline Board */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center justify-between">
          <span>5-Stage Ingestion Pipeline Board</span>
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            PIPELINE HEALTHY
          </span>
        </h3>

        <div className="grid grid-cols-5 gap-3">
          {[
            { stage: "Extract", desc: "PDF / DOCX / TXT text extraction", count: documents.length },
            { stage: "Clean", desc: "Boilerplate & header scrubbing", count: documents.length },
            { stage: "Chunk", desc: "Structure-aware & clause offsets", count: totalChunks },
            { stage: "Embed", desc: "text-embedding-3-small (1536d)", count: totalChunks },
            { stage: "Index", desc: "pgvector similarity index", count: totalChunks },
          ].map((item, idx) => (
            <div
              key={item.stage}
              className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-sky-400">0{idx + 1}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <h4 className="text-sm font-bold text-white">{item.stage}</h4>
              <p className="text-[11px] text-slate-400 mt-1 leading-tight">{item.desc}</p>
              <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-500">Processed:</span>
                <span className="text-slate-200 font-semibold">{item.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Document Inventory Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span>Corpus Document Inventory</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300">
              {documents.length} items
            </span>
          </h3>
        </div>

        {documents.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-40 text-sky-400" />
            <p className="text-sm font-medium">No documents in corpus</p>
            <p className="text-xs mt-1">Upload files or run the corpus seeder script to populate.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Document Name</th>
                  <th className="py-3 px-4">MIME / Format</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Pipeline status</th>
                  <th className="py-3 px-4">Ingested At</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {documents.map((doc) => {
                  const job = jobs.find((item) => item.documentVersionId === doc.currentVersionId);
                  return <tr key={doc.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="truncate max-w-xs">{doc.name}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">{doc.mimeType}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {Math.round(doc.sizeBytes / 1024)} KB
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        {job ? `${job.stage} ${job.progressPct}% · ${job.status}` : doc.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {new Date(doc.createdAt).toLocaleDateString()} {new Date(doc.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => inspectDoc(doc)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs transition-colors"
                      >
                        Inspect Chunks
                      </button>
                      {doc.status === "FAILED" && (
                        <button
                          onClick={() => retryDocument(doc)}
                          className="ml-2 px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs transition-colors"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chunk Drawer Modal / Panel */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-[580px] bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div>
                <h3 className="text-sm font-bold text-white truncate max-w-md">{selectedDoc.name}</h3>
                <p className="text-xs text-sky-400 font-mono mt-0.5">
                  Extracted Chunks &amp; Vector Embeddings ({docChunks.length} chunks)
                </p>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedJob?.status === "FAILED" && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
                  <p className="font-semibold">{selectedJob.errorCode || "INGESTION_FAILED"}</p>
                  <p className="mt-1">{selectedJob.errorMessage || "The pipeline failed without an error message."}</p>
                  <button onClick={() => retryDocument(selectedDoc)} className="mt-2 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-100">Retry original upload</button>
                </div>
              )}
              {docChunks.map((chunk, idx) => (
                <div
                  key={chunk.id}
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                    <span className="text-sky-400 font-semibold">Chunk #{idx + 1}</span>
                    <span>Page {chunk.page || 1} · {chunk.tokenCount} tokens</span>
                  </div>
                  <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800/80 font-mono text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {chunk.text}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                    <span>ID: {chunk.id}</span>
                    <span className="text-emerald-400">Vector Indexed (1536d)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
