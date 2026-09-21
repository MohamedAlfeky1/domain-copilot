"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppIcons } from "@/components/ui/icons";

interface DocumentData {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  status: string;
}

interface CorpusChartsProps {
  documents: DocumentData[];
  totalChunks: number;
}

const COLORS = ["#0EA5E9", "#10B981", "#6366F1", "#F59E0B", "#EC4899"];

export function CorpusCharts({ documents, totalChunks }: CorpusChartsProps) {
  const hasDocuments = documents.length > 0;

  // Real data for Document Size Distribution
  const barData = documents.map((doc) => {
    // Truncate name for X-axis display
    const shortName = doc.name
      .replace(/^clinical_protocol_/, "")
      .replace(/\.txt$/, "")
      .replace(/_/g, " ")
      .slice(0, 18);

    return {
      name: shortName,
      fullName: doc.name,
      sizeKb: Math.round(doc.sizeBytes / 1024),
    };
  });

  // Real data for Corpus Composition by MIME Type / Format
  const mimeCounts: Record<string, number> = {};
  documents.forEach((d) => {
    const typeLabel = d.mimeType === "text/plain" ? "Plain Text (.txt)" : d.mimeType === "application/pdf" ? "PDF Document" : d.mimeType;
    mimeCounts[typeLabel] = (mimeCounts[typeLabel] || 0) + 1;
  });

  const pieData = Object.entries(mimeCounts).map(([name, value]) => ({
    name,
    value,
  }));

  if (!hasDocuments) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6 bg-card border-border shadow-xs flex flex-col items-center justify-center text-center min-h-[260px] border-dashed">
          <AppIcons.evaluation className="w-8 h-8 text-muted-foreground/50 mb-2" />
          <h4 className="text-xs font-bold text-foreground font-mono uppercase">
            Document Storage Distribution
          </h4>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
            No document telemetry recorded. Ingest documents into the corpus to view real storage footprints and chunk distributions.
          </p>
          <Badge variant="outline" className="mt-3 text-[10px] font-mono text-muted-foreground">
            Awaiting Ingestion
          </Badge>
        </Card>

        <Card className="p-6 bg-card border-border shadow-xs flex flex-col items-center justify-center text-center min-h-[260px] border-dashed">
          <AppIcons.chunks className="w-8 h-8 text-muted-foreground/50 mb-2" />
          <h4 className="text-xs font-bold text-foreground font-mono uppercase">
            Corpus MIME Type Composition
          </h4>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
            No format telemetry available. Ingest PDF, DOCX, or TXT protocols to view corpus composition breakdowns.
          </p>
          <Badge variant="outline" className="mt-3 text-[10px] font-mono text-muted-foreground">
            Awaiting Ingestion
          </Badge>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* 1. Document Storage Footprint Bar Chart */}
      <Card className="lg:col-span-7 p-5 bg-card border-border shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3">
            <div>
              <h3 className="text-xs font-bold text-foreground font-mono uppercase tracking-wider">
                Document Size Distribution (KB)
              </h3>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono">
              {documents.length} Active Files
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Actual storage footprint of ingested clinical protocols prior to chunk vectorization.
          </p>
        </div>

        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <XAxis
                dataKey="fullName"
                tick={false}
                tickLine={false}
                axisLine={{ stroke: "#64748B", strokeOpacity: 0.3 }}
              />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} unit=" KB" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "11px",
                  color: "hsl(var(--foreground))",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  maxWidth: "380px",
                }}
                labelStyle={{
                  color: "hsl(var(--foreground))",
                  fontWeight: 600,
                  marginBottom: "4px",
                  wordBreak: "break-word",
                }}
                itemStyle={{
                  color: "hsl(var(--foreground))",
                }}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.2 }}
                formatter={(val: any) => [`${val} KB`, "File Size"]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ""}
              />
              <Bar dataKey="sizeKb" fill="#0EA5E9" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 2. Format / MIME Type Composition Donut */}
      <Card className="lg:col-span-5 p-5 bg-card border-border shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3">
            <div>
              <h3 className="text-xs font-bold text-foreground font-mono uppercase tracking-wider">
                Corpus Format Composition
              </h3>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono">
              {pieData.length} Formats
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">
            Real format ratio across active corpus documents.
          </p>
        </div>

        <div className="h-48 w-full flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={36}
                outerRadius={64}
                paddingAngle={4}
                dataKey="value"
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "11px",
                  color: "hsl(var(--foreground))",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                }}
                itemStyle={{
                  color: "hsl(var(--foreground))",
                }}
                formatter={(val: any) => [`${val} document(s)`, "Count"]}
              />
              <Legend
                verticalAlign="bottom"
                iconSize={8}
                wrapperStyle={{ fontSize: "11px", color: "#64748B" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
