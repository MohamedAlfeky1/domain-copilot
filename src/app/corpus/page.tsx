"use client";

import React, { useState, useEffect } from "react";
import { CorpusHeader } from "@/components/corpus/corpus-header";
import { CorpusKpiGrid } from "@/components/corpus/corpus-kpi-grid";
import { PipelineBoard } from "@/components/corpus/pipeline-board";
import { CorpusHealthPanel } from "@/components/corpus/corpus-health-panel";
import { DocumentInventory } from "@/components/corpus/document-inventory";
import { CorpusCharts } from "@/components/corpus/corpus-charts";
import { CorpusActivityFeed } from "@/components/corpus/corpus-activity-feed";
import { ChunkDrawer } from "@/components/corpus/chunk-drawer";
import { CorpusEmptyState } from "@/components/corpus/corpus-empty-state";
import { toast } from "@/components/ui/use-toast";

export default function CorpusPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [readyStatus, setReadyStatus] = useState<"READY" | "UNHEALTHY" | "CHECKING">("CHECKING");
  const [dbLatencyMs, setDbLatencyMs] = useState<number | undefined>(undefined);
  const [pgvectorStatus, setPgvectorStatus] = useState("AVAILABLE");

  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("dc_token") : null;
      if (token) return { Authorization: `Bearer ${token}` };
    } catch {}
    return {};
  };

  const fetchDocumentsWithAuth = async (retryCount = 0): Promise<any> => {
    const res = await fetch("/api/documents", {
      headers: getAuthHeaders(),
    });

    if (res.ok) {
      return await res.json();
    }

    // Bounded retry for 401 authentication readiness race on initial mount
    if (res.status === 401 && retryCount < 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return fetchDocumentsWithAuth(retryCount + 1);
    }

    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error || `Failed to load documents (HTTP ${res.status})`);
  };

  const fetchCorpusData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      }
      setError(null);

      // 1. Fetch document and job inventory with auth and bounded 401 retry
      const docsPromise = fetchDocumentsWithAuth()
        .then((data) => {
          setDocuments(data.documents || []);
          setJobs(data.jobs || []);
          setTotalChunks(data.totalChunksIndexed || 0);
        })
        .catch((err: any) => {
          console.error("Corpus documents load error:", err?.message || err);
          setError(err?.message || "Failed to load corpus documents");
        });

      // 2. Fetch runtime database and pgvector readiness
      const readyPromise = fetch("/readyz")
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setReadyStatus(data.status === "READY" ? "READY" : "UNHEALTHY");
            setDbLatencyMs(data.dbLatencyMs);
            setPgvectorStatus(data.pgvector || "AVAILABLE");
          } else {
            setReadyStatus("UNHEALTHY");
          }
        })
        .catch(() => setReadyStatus("UNHEALTHY"));

      await Promise.all([docsPromise, readyPromise]);
    } catch (err: any) {
      console.error("Corpus data fetch error:", err?.message || err);
      setError(err?.message || "Failed to load corpus data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCorpusData();
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
        headers: getAuthHeaders(),
        body: formData,
      });

      if (res.ok) {
        await fetchCorpusData();
        toast({
          title: "Upload Successful",
          description: "Document uploaded successfully.",
        });
      } else {
        toast({
          title: "Upload Failed",
          description: "Failed to upload document. Please try again.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (e.target) {
        e.target.value = "";
      }
    }
  };

  const inspectDoc = async (doc: any) => {
    setSelectedDoc(doc);
    try {
      setChunksLoading(true);
      const res = await fetch(`/api/documents/${doc.id}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setChunks(data.chunks || []);
      }
    } catch (err) {
      console.error("Failed to inspect document chunks:", err);
    } finally {
      setChunksLoading(false);
    }
  };

  // Derive real quantitative metrics
  const totalPages = documents.reduce(
    (acc, d) => acc + (d.sizeBytes ? Math.max(1, Math.ceil(d.sizeBytes / 2500)) : 1),
    0
  );

  const failureCount =
    documents.filter((d) => d.status === "FAILED").length +
    jobs.filter((j) => j.status === "FAILED").length;

  const latestDoc =
    documents.length > 0
      ? [...documents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      : null;
  const lastIngestionAt = latestDoc?.createdAt || null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Page Header */}
      <CorpusHeader
        loading={loading}
        refreshing={refreshing}
        uploading={uploading}
        readyStatus={readyStatus}
        onRefresh={() => fetchCorpusData(true)}
        onFileUpload={handleFileUpload}
      />

      {/* 2. Primary 4-Card Quantitative KPI Grid */}
      <CorpusKpiGrid
        totalDocuments={documents.length}
        totalPages={totalPages}
        totalChunks={totalChunks}
        failureCount={failureCount}
        loading={loading}
      />

      {/* 3. Ingestion Pipeline Stepper + Corpus Health Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 flex flex-col">
          <PipelineBoard
            totalDocuments={documents.length}
            totalChunks={totalChunks}
            jobs={jobs}
            isUploading={uploading}
            loading={loading}
          />
        </div>
        <div className="lg:col-span-5 flex flex-col">
          <CorpusHealthPanel
            readyStatus={readyStatus}
            lastIngestionAt={lastIngestionAt}
            totalChunks={totalChunks}
            dbLatencyMs={dbLatencyMs}
            pgvectorStatus={pgvectorStatus}
            isUploading={uploading}
            loading={loading}
          />
        </div>
      </div>

      {/* 4. Corpus Analytics: Document Storage Distribution & Format Composition */}
      {!loading && documents.length > 0 && (
        <CorpusCharts documents={documents} totalChunks={totalChunks} />
      )}

      {/* 5. Temporal Activity: Recent Ingestion & Indexing Events */}
      {!loading && documents.length > 0 && (
        <CorpusActivityFeed documents={documents} />
      )}

      {/* 6. Detailed Records: Full-Width Document Catalog Inventory */}
      {loading ? (
        <DocumentInventory
          documents={[]}
          loading={true}
          onInspectDoc={inspectDoc}
        />
      ) : error ? (
        <div className="p-8 text-center bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          <p className="text-sm font-semibold">Failed to Load Corpus Documents</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      ) : documents.length === 0 ? (
        <CorpusEmptyState
          onUploadClick={() => {
            const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
            if (fileInput) fileInput.click();
          }}
          uploading={uploading}
        />
      ) : (
        <DocumentInventory
          documents={documents}
          loading={false}
          onInspectDoc={inspectDoc}
        />
      )}

      {/* 6. Chunk Inspector Slide-Over Drawer */}
      <ChunkDrawer
        document={selectedDoc}
        chunks={chunks}
        loading={chunksLoading}
        onClose={() => setSelectedDoc(null)}
      />
    </div>
  );
}
