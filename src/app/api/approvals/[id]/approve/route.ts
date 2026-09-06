import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    const { comment, reviewerId } = body;

    const approval = await container.approvalService.approve(
      params.id,
      reviewerId || "usr-approver-001",
      comment
    );

    return NextResponse.json({
      message: "Approval granted successfully",
      approval,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.httpStatus || 500 });
  }
}
