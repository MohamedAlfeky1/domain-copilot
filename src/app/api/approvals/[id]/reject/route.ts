/**
 * DOMAIN COPILOT - HITL REJECT ENDPOINT (HITL-005)
 * Rejects a pending action with mandatory reason.
 * Marks the associated run as REFUSED.
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
    const body = await req.json();
    const { reason } = body;

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: "Rejection reason is mandatory" },
        { status: 400 }
      );
    }

    const approval = await container.approvalService.reject(
      params.id,
      user.id,
      reason
    );

    // HITL-005: After rejection, mark the associated run as REFUSED
    if (approval.runId) {
      const run = await container.db.getRunById(approval.runId);
      if (run && run.status === "APPROVAL_PENDING") {
        const refusalReason = `Human reviewer rejected: ${reason}`;
        await container.db.updateRunStatus(
          approval.runId,
          "REFUSED",
          refusalReason,
          refusalReason
        );

        // Clean up paused workflow state
        const pausedState = container.orchestratorService.getPausedState(approval.runId);
        if (pausedState) {
          // Resume with rejection so orchestrator cleans up properly
          try {
            await container.orchestratorService.resumeWorkflow(
              approval.runId,
              params.id
            );
          } catch {
            // Expected — resumeWorkflow handles rejection internally
          }
        }
      }
    }

    return NextResponse.json({
      message: "Proposal rejected",
      approval,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.httpStatus || 500 }
    );
  }
}
