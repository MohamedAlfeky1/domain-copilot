import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const run = await container.db.getRunById(params.id);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const steps = await container.db.getRunSteps(run.id);
    const usage = await container.db.getUsageByRun(run.id);

    return NextResponse.json({
      run,
      steps,
      usage,
      stepCount: steps.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
