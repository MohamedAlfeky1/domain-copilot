import { NextRequest, NextResponse } from "next/server";
import { ACTIVE_VARIANT } from "@/config/variant.config";
import { publicUser, requireAuth } from "@/infrastructure/auth/auth-guard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const permissions = user.role === "ADMIN"
      ? ["QUERY_COPILOT", "VIEW_DOCUMENTS", "INSPECT_RUNS", "UPLOAD_DOCUMENTS", "MANAGE_CORPUS", "APPROVE_ACTIONS"]
      : user.role === "APPROVER"
        ? ["QUERY_COPILOT", "VIEW_DOCUMENTS", "INSPECT_RUNS", "REINGEST_DOCUMENTS", "APPROVE_ACTIONS"]
        : user.role === "EXPERT"
          ? ["QUERY_COPILOT", "VIEW_DOCUMENTS", "INSPECT_OWN_RUNS"]
          : ["VIEW_DOCUMENTS", "INSPECT_OWN_RUNS"];

    return NextResponse.json({ user: publicUser(user), activeVariant: ACTIVE_VARIANT, permissions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.httpStatus || 500 });
  }
}
