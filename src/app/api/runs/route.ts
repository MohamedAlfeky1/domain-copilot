import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { requireAuth, canAccessRun } from "@/infrastructure/auth/auth-guard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const [allRuns, approvals] = await Promise.all([
      container.db.listRuns(50),
      container.db.listApprovals(),
    ]);

    const accessibleRuns = allRuns
      .filter((run) => canAccessRun(user, run, approvals))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    return NextResponse.json({ runs: accessibleRuns });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch runs" },
      { status: error.httpStatus || 500 }
    );
  }
}
