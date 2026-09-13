import { NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function GET() {
  try {
    const readiness = await container.db.checkReadiness();
    return NextResponse.json({
      status: "READY",
      database: readiness.database,
      pgvector: readiness.pgvector,
      totalChunksIndexed: readiness.totalChunks,
      dbLatencyMs: readiness.latencyMs,
      details: readiness.details,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "UNHEALTHY",
        database: "DISCONNECTED",
        pgvector: "UNAVAILABLE",
        error: error?.message || "Database or pgvector readiness check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
