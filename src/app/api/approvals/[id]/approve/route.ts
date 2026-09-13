/**
 * DOMAIN COPILOT - HITL APPROVE ENDPOINT (HITL-003/004)
 * Approves a pending action and returns metadata needed to resume the workflow.
 */

import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { requireRole } from "@/infrastructure/auth/auth-guard";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "APPROVER"]);
    const body = await req.json().catch(() => ({}));
    const { comment, reviewerId } = body;

    const approval = await container.approvalService.approve(
      params.id,
      reviewerId || user.id,
      comment
    );

    // After approval, check if there is an associated paused run to resume
    const run = approval.runId
      ? await container.db.getRunById(approval.runId)
      : null;

    const isResumable = run?.status === "APPROVAL_PENDING";

    return NextResponse.json({
      message: "Approval granted successfully",
      approval,
      resumable: isResumable,
      resumeEndpoint: isResumable
        ? `/api/runs/${approval.runId}/resume`
        : undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.httpStatus || 500 }
    );
  }
}
