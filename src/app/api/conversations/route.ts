import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { requireAuth, requireRole } from "@/infrastructure/auth/auth-guard";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * GET /api/conversations
 * List conversations for the authenticated user, ordered by updatedAt DESC.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const conversations = await container.db.listConversationsByOwner(user.id);
    return NextResponse.json({ conversations });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.httpStatus || (error.name === "UnauthorizedError" ? 401 : 500) }
    );
  }
}

/**
 * POST /api/conversations
 * Create a new conversation owned by the authenticated user.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN", "APPROVER", "EXPERT"]);
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim().length > 0
      ? body.title.trim()
      : "New Chat";

    const id = `conv-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const now = new Date().toISOString();

    const conversation = await container.db.createConversation({
      id,
      ownerId: user.id,
      title,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error: any) {
    const status = error.httpStatus ||
      (error.name === "UnauthorizedError" ? 401 :
       error.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
}
