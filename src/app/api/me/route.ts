import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { ACTIVE_VARIANT } from "@/config/variant.config";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cookieToken = req.cookies.get("dc_token")?.value;
    const token = authHeader?.replace("Bearer ", "") || cookieToken;

    if (!token) {
      // Default to guest expert
      const defaultUser = await container.db.getUserByEmail("expert@domaincopilot.ai");
      return NextResponse.json({
        user: defaultUser,
        activeVariant: ACTIVE_VARIANT,
        permissions: ["QUERY_COPILOT", "VIEW_DOCUMENTS", "INSPECT_RUNS"],
      });
    }

    try {
      const payloadStr = Buffer.from(token.replace("jwt-", ""), "base64").toString("utf-8");
      const payload = JSON.parse(payloadStr);
      const user = await container.db.getUserById(payload.id);

      const permissions =
        user?.role === "ADMIN" || user?.role === "APPROVER"
          ? ["QUERY_COPILOT", "VIEW_DOCUMENTS", "INSPECT_RUNS", "UPLOAD_DOCUMENTS", "APPROVE_ACTIONS"]
          : ["QUERY_COPILOT", "VIEW_DOCUMENTS", "INSPECT_RUNS"];

      return NextResponse.json({
        user: user || payload,
        activeVariant: ACTIVE_VARIANT,
        permissions,
      });
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
