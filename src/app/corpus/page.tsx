"use client";

import React, { useState, useEffect } from "react";
import {
  Database,
  UploadCloud,
  FileText,
  Layers,
  CheckCircle2,
  RefreshCw,
  Search,
} from "lucide-react";

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
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/20 text-emerald-400 font-semibold uppercase">
              CORPUS REPOSITORY
            </span>
            <span className="text-xs text-slate-400">Deterministic Chunking &amp; Versioning</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Corpus Document Library</h2>
          <p className="text-xs text-slate-400 mt-1">
            Explore active versions, page counts, verified checksums and underlying pgvector chunk indices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDocs}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <label className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-lg shadow-emerald-600/20 transition-all">
            <UploadCloud className="w-4 h-4" />
            <span>{uploading ? "Ingesting..." : "Ingest Document"}</span>
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

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents by filename or keyword..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
        <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300">
          Total Indexed Chunks: <strong className="text-emerald-400">{totalChunks}</strong>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Document Title</th>
              <th className="py-3 px-4">MIME Type</th>
              <th className="py-3 px-4">Size</th>
              <th className="py-3 px-4">Content Hash (SHA-256)</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {filteredDocs.map((doc) => (
              <tr key={doc.id} className="hover:bg-slate-800/40">
                <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span className="truncate max-w-sm">{doc.name}</span>
                </td>
                <td className="py-3 px-4 font-mono text-slate-400">{doc.mimeType}</td>
                <td className="py-3 px-4 font-mono text-slate-400">{Math.round(doc.sizeBytes / 1024)} KB</td>
                <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                  {doc.contentHash?.slice(0, 16)}...
                </td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    {doc.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => inspectDoc(doc)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs"
                  >
                    View Chunks
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Chunk Inspection Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-[600px] bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white truncate max-w-md">{selectedDoc.name}</h3>
                <p className="text-xs text-emerald-400 font-mono mt-0.5">
                  Extracted Chunks ({chunks.length})
                </p>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-white text-xs"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chunks.map((chunk, idx) => (
                <div key={chunk.id} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2">
                  <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                    <span className="text-emerald-400 font-bold">Chunk #{idx + 1}</span>
                    <span>Page {chunk.page || 1} · {chunk.tokenCount} tokens</span>
                  </div>
                  <div className="bg-slate-900/90 p-3 rounded font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap border border-slate-800">
                    {chunk.text}
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
