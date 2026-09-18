import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { requireAuth, requireRunAccess } from "@/infrastructure/auth/auth-guard";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);
    const run = await container.db.getRunById(params.id);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    requireRunAccess(user, run);

    const steps = await container.db.getRunSteps(run.id);
    const usage = await container.db.getUsageByRun(run.id);
    const approvals = await container.db.listApprovals();
    const approval = approvals.find((a) => a.runId === run.id) || null;

    const normalizedRun = {
      ...run,
      answer: run.finalOutput || (run as any).answer || "",
    };

    return NextResponse.json({
      run: normalizedRun,
      steps,
      usage,
      stepCount: steps.length,
      approval,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.httpStatus || 500 });
  }
}
