import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { requireAuth, requireRole, requireConversationAccess } from "@/infrastructure/auth/auth-guard";

export const runtime = "nodejs";

/**
 * GET /api/conversations/:id
 * Retrieve a specific conversation by ID with ownership verification.
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

    return NextResponse.json({ conversation });
  } catch (error: any) {
    const status = error.httpStatus ||
      (error.name === "UnauthorizedError" ? 401 :
       error.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
}

/**
 * PATCH /api/conversations/:id
 * Update conversation title with ownership verification.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "APPROVER", "EXPERT"]);
    const conversation = await container.db.getConversationById(params.id);

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    requireConversationAccess(user, conversation);

    const body = await req.json().catch(() => ({}));
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return NextResponse.json({ error: "Title must be a non-empty string" }, { status: 400 });
    }

    const title = body.title.trim();
    const updatedAt = new Date().toISOString();
    await container.db.updateConversation(params.id, { title, updatedAt });

    const updated = await container.db.getConversationById(params.id);
    return NextResponse.json({ conversation: updated });
  } catch (error: any) {
    const status = error.httpStatus ||
      (error.name === "UnauthorizedError" ? 401 :
       error.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
}

/**
 * DELETE /api/conversations/:id
 * Delete conversation and cascading messages with ownership verification.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireRole(req, ["ADMIN", "APPROVER", "EXPERT"]);
    const conversation = await container.db.getConversationById(params.id);

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    requireConversationAccess(user, conversation);

    await container.db.deleteConversation(params.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const status = error.httpStatus ||
      (error.name === "UnauthorizedError" ? 401 :
       error.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
}
