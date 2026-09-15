import { NextRequest, NextResponse } from "next/server";
import { runControllerRegistry } from "@/core/application/run-controller";
import { container } from "@/core/application/container";
import { requireAuth, requireRunAccess } from "@/infrastructure/auth/auth-guard";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);
    const runId = params.id;
    const run = await container.db.getRunById(runId);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    requireRunAccess(user, run);

    const cancelled = runControllerRegistry.cancelRun(runId);
    await container.db.updateRunStatus(runId, "CANCELLED");

    return NextResponse.json({
      message: cancelled ? "Run execution cancelled successfully" : "Run already finished or not active",
      runId,
      status: "CANCELLED",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.httpStatus || 500 });
  }
}
