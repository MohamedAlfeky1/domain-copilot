import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { modifiedPayload, comment, reviewerId } = body;

    if (!modifiedPayload) {
      return NextResponse.json({ error: "modifiedPayload is required for edit-and-approve" }, { status: 400 });
    }

    const approval = await container.approvalService.editAndApprove(
      params.id,
      reviewerId || "usr-approver-001",
      modifiedPayload,
      comment
    );

    return NextResponse.json({
      message: "Modified payload approved successfully",
      approval,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.httpStatus || 500 });
  }
}
