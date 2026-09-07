import { NextRequest } from "next/server";
import { container } from "@/core/application/container";
import { runControllerRegistry } from "@/core/application/run-controller";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const runId = params.id;
  const run = await container.db.getRunById(runId);

  if (!run) {
    return new Response(JSON.stringify({ error: "Run not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const signal = runControllerRegistry.getSignal(runId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      sendEvent("run_started", {
        runId: run.id,
        correlationId: run.correlationId,
        query: run.query,
      });

      try {
        await container.orchestratorService.runWorkflow(
          run.id,
          run.query,
          run.sessionId,
          run.correlationId,
          (progress) => {
            sendEvent(progress.type, progress);
          },
          signal
        );
      } catch (err: any) {
        sendEvent("error", { message: err.message });
      } finally {
        runControllerRegistry.cleanup(runId);
        controller.close();
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
}
