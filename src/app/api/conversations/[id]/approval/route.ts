import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { requireAuth, requireConversationAccess } from "@/infrastructure/auth/auth-guard";

export const runtime = "nodejs";

/**
 * GET /api/conversations/:id/approval
 * Retrieves the active APPROVAL_PENDING run and its pending approval for a given conversation.
 * Enforces ownership/role authorization.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);
    const conversation = await container.db.getConversationById(params.id);

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    requireConversationAccess(user, conversation);

    const runs =
      typeof container.db.getRunsBySessionId === "function"
        ? await container.db.getRunsBySessionId(conversation.id)
        : (await container.db.listRuns(500)).filter((r) => r.sessionId === conversation.id);

    const pendingRun = runs.find((r) => r.status === "APPROVAL_PENDING");

    if (!pendingRun) {
      return NextResponse.json({
        hasPendingApproval: false,
        runId: null,
        conversationId: conversation.id,
        status: null,
        approval: null,
      });
    }

    const approvals = await container.db.listApprovals();
    const approval = approvals.find(
      (a) =>
        a.runId === pendingRun.id &&
        (a.status === "PENDING" || a.status === "APPROVED" || a.status === "EDIT_APPROVED")
    );

    if (!approval) {
      return NextResponse.json({
        hasPendingApproval: false,
        runId: pendingRun.id,
        conversationId: conversation.id,
        status: pendingRun.status,
        approval: null,
      });
    }

    return NextResponse.json({
      hasPendingApproval: true,
      runId: pendingRun.id,
      conversationId: conversation.id,
      status: pendingRun.status,
      approval: {
        id: approval.id,
        approvalId: approval.id,
        runId: approval.runId,
        status: approval.status,
        riskLevel: approval.riskLevel,
        proposedAction: approval.proposedAction,
        requesterAgent: approval.requesterAgent,
        riskFlags: (approval.originalPayload?.flags as any[]) || [],
        createdAt: approval.createdAt,
      },
    });
  } catch (error: any) {
    const status =
      error.httpStatus ||
      (error.name === "UnauthorizedError"
        ? 401
        : error.name === "ForbiddenError"
        ? 403
        : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
}
