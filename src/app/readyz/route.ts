import { NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function GET() {
  try {
    const chunkCount = await container.db.countTotalChunks();
    return NextResponse.json({
      status: "READY",
      database: "CONNECTED",
      pgvector: "READY",
      totalChunksIndexed: chunkCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "UNHEALTHY",
        error: error.message,
      },
      { status: 503 }
    );
  }
}
