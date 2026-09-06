import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { reason, reviewerId } = body;

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: "Rejection reason is mandatory" }, { status: 400 });
    }

    const approval = await container.approvalService.reject(
      params.id,
      reviewerId || "usr-approver-001",
      reason
    );

    return NextResponse.json({
      message: "Proposal rejected",
      approval,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.httpStatus || 500 });
  }
}
