/**
 * DOMAIN COPILOT - HITL RESUME API (HITL-003)
 * Resumes a paused workflow after human approval decision.
 * Returns SSE stream for remaining workflow steps.
 */

import { NextRequest } from "next/server";
import { container } from "@/core/application/container";
import { runControllerRegistry } from "@/core/application/run-controller";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const runId = params.id;

  try {
    const body = await req.json();
    const { approvalId } = body;

    if (!approvalId) {
      return new Response(
        JSON.stringify({ error: "approvalId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate run exists and is in APPROVAL_PENDING state
    const run = await container.db.getRunById(runId);
    if (!run) {
      return new Response(
        JSON.stringify({ error: "Run not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (run.status !== "APPROVAL_PENDING") {
      return new Response(
        JSON.stringify({ error: `Run is in "${run.status}" state, not APPROVAL_PENDING` }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate approval exists and has been decided
    const approval = await container.db.getApprovalById(approvalId);
    if (!approval) {
      return new Response(
        JSON.stringify({ error: "Approval not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (approval.status === "PENDING") {
      return new Response(
        JSON.stringify({ error: "Approval is still pending human decision" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create abort controller for this resumed run
    const controller = runControllerRegistry.createController(runId);
    const signal = controller.signal;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(streamController) {
        const sendEvent = (event: string, data: any) => {
          streamController.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        sendEvent("run_resumed", {
          runId,
          approvalId,
          approvalStatus: approval.status,
        });

        try {
          await container.orchestratorService.resumeWorkflow(
            runId,
            approvalId,
            (progress) => {
              sendEvent(progress.type, progress);
            },
            signal
          );
        } catch (err: any) {
          sendEvent("error", { message: err.message });
        } finally {
          runControllerRegistry.cleanup(runId);
          streamController.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "x-correlation-id": run.correlationId,
      },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
