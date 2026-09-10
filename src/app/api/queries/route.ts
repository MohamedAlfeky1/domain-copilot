import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { runControllerRegistry } from "@/core/application/run-controller";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, sessionId, filters } = body;

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: "Query cannot be empty" }, { status: 400 });
    }

    // Validate scope filter immediately to fail fast with 400 if incompatible
    if (filters) {
      try {
        (container.db as any).validateScopeFilter?.(filters);
      } catch (err: any) {
        if (err.name === "IncompatibleFilterScopeError") {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
    }

    const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const correlationId = req.headers.get("x-correlation-id") || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Create active run
    const run = await container.db.saveRun({
      id: runId,
      sessionId: sessionId || "default-session",
      correlationId,
      query,
      status: "STARTED",
      filters: filters || undefined,
      citations: [],
      startedAt: new Date().toISOString(),
    });

    runControllerRegistry.createController(runId);

    const response = NextResponse.json({
      runId: run.id,
      correlationId: run.correlationId,
      status: run.status,
      query: run.query,
    });

    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
