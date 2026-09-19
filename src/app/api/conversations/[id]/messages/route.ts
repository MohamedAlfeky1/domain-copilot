import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { runControllerRegistry } from "@/core/application/run-controller";
import { requireAuth, requireRole, requireConversationAccess } from "@/infrastructure/auth/auth-guard";
import { generateDeterministicTitle } from "@/lib/chat-title";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * GET /api/conversations/:id/messages
 * Retrieve all messages for a conversation in chronological order.
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

    const messages = await container.db.listMessagesByConversation(params.id);
    return NextResponse.json({ messages });
  } catch (error: any) {
    const status = error.httpStatus ||
      (error.name === "UnauthorizedError" ? 401 :
       error.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
}

/**
 * POST /api/conversations/:id/messages
 * Post a user message:
 * 1. Validates ownership
 * 2. Persists user message
 * 3. Updates conversation title if first message
 * 4. Creates linked Run with sessionId = conversationId
 * 5. Returns run details and created user message
 */
export async function POST(
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
    const { content, filters } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Message content cannot be empty" }, { status: 400 });
    }

    const query = content.trim();

    // Validate scope filter immediately if provided
    if (filters) {
      try {
        (container.db as any).validateScopeFilter?.(filters);
      } catch (err: any) {
        if (err.name === "IncompatibleFilterScopeError") {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
    }

    const now = new Date().toISOString();

    // Auto-derive title from first user message if current title is default
    if (conversation.title === "New Chat" || conversation.title === "") {
      const derivedTitle = generateDeterministicTitle(query);
      await container.db.updateConversation(conversation.id, {
        title: derivedTitle,
        updatedAt: now,
      });
    }

    // Persist user message
    const messageId = `msg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const userMessage = await container.db.createMessage({
      id: messageId,
      conversationId: conversation.id,
      runId: null,
      role: "user",
      content: query,
      citations: null,
      createdAt: now,
    });

    // Create Run linked to conversation and user
    const runId = `run-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const correlationId =
      req.headers.get("x-correlation-id") ||
      `corr-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    const run = await container.db.saveRun({
      id: runId,
      ownerId: user.id,
      sessionId: conversation.id,
      correlationId,
      query,
      status: "STARTED",
      filters: filters || undefined,
      citations: [],
      startedAt: now,
    });

    runControllerRegistry.createController(runId);

    const response = NextResponse.json(
      {
        runId: run.id,
        correlationId: run.correlationId,
        status: run.status,
        query: run.query,
        message: userMessage,
        conversationId: conversation.id,
      },
      { status: 201 }
    );

    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error: any) {
    const status = error.httpStatus ||
      (error.name === "UnauthorizedError" ? 401 :
       error.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ error: error.message }, { status });
  }
}
