import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as any;

    const approvals = await container.db.listApprovals(status || undefined);
    return NextResponse.json({
      approvals,
      totalCount: approvals.length,
      pendingCount: approvals.filter((a) => a.status === "PENDING").length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { runId, toolCallId, proposedAction, riskLevel, requesterAgent, payload } = body;

    if (!runId || !proposedAction || !payload) {
      return NextResponse.json({ error: "runId, proposedAction, and payload are required" }, { status: 400 });
    }

    const approval = await container.approvalService.createApprovalRequest({
      runId,
      toolCallId,
      proposedAction,
      riskLevel: riskLevel || "HIGH",
      requesterAgent: requesterAgent || "Supervisor",
      payload,
    });

    return NextResponse.json(approval, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
