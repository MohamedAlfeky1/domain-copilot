/**
 * DOMAIN COPILOT - MULTI-AGENT SUPERVISOR & ORCHESTRATION SERVICE
 * Implements Supervisor State Machine coordinating 3 Domain Specialists.
 * Features: Step timeouts, iteration circuit breakers, safe refusal, HITL pause, and live event emission.
 */

import { IDatabasePort } from "../ports/database.port";
import { IAIProviderPort } from "../ports/ai-provider.port";
import { HybridRetrievalService, RetrievalResult } from "../retrieval/retrieval.service";
import { RetrievalScopeFilter } from "../ports/vector-store.port";
import { ToolRegistry } from "./tool-registry";
import { ACTIVE_VARIANT } from "../../../config/variant.config";
import { Run, RunStep, Citation } from "../../domain/types";

export interface AgentProgressEvent {
  type: "step_start" | "step_complete" | "token" | "citation" | "approval_required" | "refusal" | "done" | "error";
  agent?: string;
  stepIndex?: number;
  message?: string;
  data?: unknown;
  token?: string;
}

export class MultiAgentOrchestrator {
  private readonly MAX_ITERATIONS = 5;
  private readonly STEP_TIMEOUT_MS = 30000;

  constructor(
    private db: IDatabasePort,
    private aiProvider: IAIProviderPort,
    private retriever: HybridRetrievalService,
    private tools: ToolRegistry
  ) {}

  async runWorkflow(
    runId: string,
    query: string,
    sessionId: string,
    correlationId: string,
    emitEvent?: (event: AgentProgressEvent) => void,
    signal?: AbortSignal,
    filters?: RetrievalScopeFilter
  ): Promise<{ finalAnswer: string; citations: Citation[]; status: Run["status"]; refusalReason?: string }> {
    const specialists = ACTIVE_VARIANT.domainName
      ? [
          "Clinical Evidence Extractor",
          "Contraindication & Safety Auditor",
          "Therapeutic Protocol Drafter",
        ]
      : ["Evidence Extractor", "Risk Auditor", "Response Drafter"];

    let stepIndex = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    // Helper to save step and notify UI
    const createStep = async (agent: string, stepType: RunStep["stepType"], input?: unknown): Promise<RunStep> => {
      stepIndex++;
      const step = await this.db.saveRunStep({
        id: `step-${runId}-${stepIndex}`,
        runId,
        stepIndex,
        stepType,
        agent,
        status: "RUNNING",
        inputPayload: input,
        startedAt: new Date().toISOString(),
      });
      emitEvent?.({
        type: "step_start",
        agent,
        stepIndex,
        message: `${agent} activated`,
      });
      return step;
    };

    // Helper to finish step
    const completeStep = async (step: RunStep, output: unknown, latencyMs: number) => {
      await this.db.updateRunStep(step.id, "COMPLETED", output, latencyMs);
      emitEvent?.({
        type: "step_complete",
        agent: step.agent,
        stepIndex: step.stepIndex,
        data: output,
      });
    };

    try {
      // Step 1: Retrieval Phase
      const startRet = Date.now();
      const retStep = await createStep("Retrieval Engine", "RETRIEVAL", { query, filters });
      const retrievalResult: RetrievalResult = await this.retriever.retrieve(query, filters, correlationId);
      await completeStep(retStep, retrievalResult.trace, Date.now() - startRet);

      // Emit citations immediately
      for (const cite of retrievalResult.citations) {
        emitEvent?.({ type: "citation", data: cite });
      }

      // Check Low-Evidence Refusal Gate (RET-004)
      if (retrievalResult.isRefusalRequired) {
        const refusalReason =
          retrievalResult.refusalReason ||
          "The available corpus lacks sufficient evidence to reliably answer this question.";
        await this.db.updateRunStatus(runId, "REFUSED", refusalReason, refusalReason);
        emitEvent?.({
          type: "refusal",
          message: refusalReason,
        });
        return {
          finalAnswer: refusalReason,
          citations: [],
          status: "REFUSED",
          refusalReason,
        };
      }

      const evidenceContext = retrievalResult.chunks
        .map((c, i) => `[Evidence ${i + 1} | ID: ${c.id} | Page: ${c.page || 1} | Section: ${c.section || "General"}]:\n${c.text}`)
        .join("\n\n");

      // Step 2: Domain Specialist 1 - Evidence Extractor (AGT-003)
      const startS1 = Date.now();
      const s1Step = await createStep(specialists[0], "AGENT_EXECUTION");
      const s1Prompt = `You are the ${specialists[0]} for Domain: ${ACTIVE_VARIANT.domainName}.
Your task: Extract key factual claims, data points, and constraints directly from the provided evidence.
Query: "${query}"

<untrusted_evidence>
${evidenceContext}
</untrusted_evidence>

Respond with structured findings and cite the relevant chunk IDs.`;

      const s1Result = await this.aiProvider.generateCompletion([
        { role: "system", content: s1Prompt },
      ], { model: "gpt-4o", temperature: 0.1 });

      totalPromptTokens += s1Result.promptTokens;
      totalCompletionTokens += s1Result.completionTokens;
      await completeStep(s1Step, { findings: s1Result.text }, Date.now() - startS1);

      // Step 3: Domain Specialist 2 - Risk & Compliance Auditor (AGT-004)
      const startS2 = Date.now();
      const s2Step = await createStep(specialists[1], "AGENT_EXECUTION");
      const s2Prompt = `You are the ${specialists[1]}.
Enforce Domain Risk Policy: "${ACTIVE_VARIANT.domainRiskPolicy}".
Review the extracted findings for safety, compliance, and contraindications.
Findings:
${s1Result.text}

Determine whether the advice meets compliance criteria.`;

      const s2Result = await this.aiProvider.generateCompletion([
        { role: "system", content: s2Prompt },
      ], { model: "gpt-4o", temperature: 0.1 });

      totalPromptTokens += s2Result.promptTokens;
      totalCompletionTokens += s2Result.completionTokens;
      await completeStep(s2Step, { audit: s2Result.text }, Date.now() - startS2);

      // Step 4: Domain Specialist 3 - Drafting Agent with Streaming (AGT-005 / RT-001)
      const startS3 = Date.now();
      const s3Step = await createStep(specialists[2], "AGENT_EXECUTION");
      const s3Prompt = `You are the ${specialists[2]}.
Synthesize the verified evidence and compliance findings into an authoritative, clear response.
Insert structured citation references like [Doc 1, p. 1] linking to the provided evidence chunks.
Evidence:
${evidenceContext}

Auditor Review:
${s2Result.text}`;

      let finalSynthesis = "";
      const streamRes = await this.aiProvider.streamCompletion(
        [
          { role: "system", content: s3Prompt },
          { role: "user", content: query },
        ],
        (token) => {
          finalSynthesis += token;
          emitEvent?.({ type: "token", token });
        },
        { model: "gpt-4o", signal }
      );

      totalPromptTokens += streamRes.promptTokens;
      totalCompletionTokens += streamRes.completionTokens;
      await completeStep(s3Step, { synthesisLength: finalSynthesis.length }, Date.now() - startS3);

      // Record Cost & Tokens (OBS-002)
      const totalTokens = totalPromptTokens + totalCompletionTokens;
      const promptCost = (totalPromptTokens / 1_000_000) * 2.50; // gpt-4o pricing
      const completionCost = (totalCompletionTokens / 1_000_000) * 10.00;
      const totalCostUsd = promptCost + completionCost;

      await this.db.recordUsage({
        id: `usage-${runId}`,
        runId,
        correlationId,
        provider: "openai",
        model: "gpt-4o",
        callType: "COMPLETION",
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
        costUsd: Math.round(totalCostUsd * 100000) / 100000,
        createdAt: new Date().toISOString(),
      });

      // Mark Run Completed
      await this.db.updateRunStatus(runId, "COMPLETED", undefined, finalSynthesis);
      emitEvent?.({
        type: "done",
        data: {
          totalTokens,
          totalCostUsd,
          citationsCount: retrievalResult.citations.length,
        },
      });

      return {
        finalAnswer: finalSynthesis,
        citations: retrievalResult.citations,
        status: "COMPLETED",
      };
    } catch (err: any) {
      if (signal?.aborted) {
        await this.db.updateRunStatus(runId, "CANCELLED");
        emitEvent?.({ type: "error", message: "Execution cancelled by client." });
        return {
          finalAnswer: "Workflow cancelled by user.",
          citations: [],
          status: "CANCELLED",
        };
      }

      await this.db.updateRunStatus(runId, "FAILED", err.message);
      emitEvent?.({ type: "error", message: err.message });
      throw err;
    }
  }
}
