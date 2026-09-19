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
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [readyStatus, setReadyStatus] = useState<"READY" | "UNHEALTHY" | "CHECKING">("CHECKING");
  const [dbLatencyMs, setDbLatencyMs] = useState<number | undefined>(undefined);
  const [pgvectorStatus, setPgvectorStatus] = useState("AVAILABLE");

  const fetchCorpusData = async () => {
    try {
      setLoading(true);

      // 1. Fetch document and job inventory
      const docsPromise = fetch("/api/documents")
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setDocuments(data.documents || []);
            setJobs(data.jobs || []);
            setTotalChunks(data.totalChunksIndexed || 0);
          }
        })
        .catch((err) => console.error("Failed to load documents:", err));

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
    } catch (err) {
      console.error("Corpus data fetch error:", err);
    } finally {
      setLoading(false);
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
        body: formData,
      });

      if (res.ok) {
        await fetchCorpusData();
        toast({
          title: "Upload Successful",
          description: "Document uploaded successfully.",
          variant: "success",
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
      const res = await fetch(`/api/documents/${doc.id}`);
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
        uploading={uploading}
        readyStatus={readyStatus}
        onRefresh={fetchCorpusData}
        onFileUpload={handleFileUpload}
      />

      {/* 2. Primary 4-Card Quantitative KPI Grid */}
      <CorpusKpiGrid
        totalDocuments={documents.length}
        totalPages={totalPages}
        totalChunks={totalChunks}
        failureCount={failureCount}
      />

      {/* 3. Ingestion Pipeline Stepper + Corpus Health Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 flex flex-col">
          <PipelineBoard
            totalDocuments={documents.length}
            totalChunks={totalChunks}
            jobs={jobs}
            isUploading={uploading}
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
          />
        </div>
      </div>

      {/* 4. Full-Width Document Catalog Inventory */}
      {documents.length === 0 ? (
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
          onInspectDoc={inspectDoc}
        />
      )}

      {/* 5. Telemetry Distribution Visualizations & Recent Ingestion Events */}
      {documents.length > 0 && (
        <div className="space-y-5 pt-1">
          <CorpusCharts documents={documents} totalChunks={totalChunks} />
          <CorpusActivityFeed documents={documents} />
        </div>
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
