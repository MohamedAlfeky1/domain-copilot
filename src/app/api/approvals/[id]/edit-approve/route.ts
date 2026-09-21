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
    const { modifiedPayload, comment } = body;

    if (!modifiedPayload) {
      return NextResponse.json({ error: "modifiedPayload is required for edit-and-approve" }, { status: 400 });
    }

    const approval = await container.approvalService.editAndApprove(
      params.id,
      user.id,
      modifiedPayload,
      comment
    );

    const run = approval.runId
      ? await container.db.getRunById(approval.runId)
      : null;

    return NextResponse.json({
      message: "Modified payload approved successfully",
      approval,
      conversationId: run?.sessionId || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.httpStatus || 500 });
  }
}
