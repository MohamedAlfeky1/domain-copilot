/**
 * DOMAIN COPILOT - MULTI-AGENT SUPERVISOR & ORCHESTRATION SERVICE
 * Implements Supervisor State Machine coordinating 3 Domain Specialists.
 * Features: Step timeouts, iteration circuit breakers, safe refusal, HITL pause/resume, and live event emission.
 *
 * AGT-001: Zod contract validation on every specialist output
 * AGT-002: Externalized specialist prompt artifacts
 * AGT-003: Evidence Extractor with tool-calling support
 * AGT-004: Risk Auditor with tool-calling support
 * AGT-005: Response Drafter with streaming + tool support
 * AGT-006: Tool schemas passed to LLM, executed via ToolRegistry
 * HITL-001: Agent creates pending approval via ApprovalService
 * HITL-002: Workflow pauses on APPROVAL_PENDING
 * HITL-003: resumeWorkflow() continues after human decision
 * HITL-004: Approved action executed via ToolRegistry
 */

import { IDatabasePort } from "../ports/database.port";
import { IAIProviderPort, CompletionMessage, CompletionResult } from "../ports/ai-provider.port";
import { HybridRetrievalService, RetrievalResult } from "../retrieval/retrieval.service";
import { RetrievalScopeFilter } from "../ports/vector-store.port";
import { ToolRegistry } from "./tool-registry";
import { ACTIVE_VARIANT } from "../../../config/variant.config";
import { Run, RunStep, Citation } from "../../domain/types";
import { StepTimeoutError, ValidationError } from "../../domain/errors";
import { ApprovalService } from "../approvals/approval.service";
import { ITwistPort, TwistEvaluationResult } from "../ports/twist.port";
import {
  ExtractorOutputSchema,
  AuditorOutputSchema,
  DrafterOutputSchema,
  parseAgentOutput,
  ExtractorOutput,
  AuditorOutput,
  DrafterOutput,
} from "./agent-contracts";
import {
  buildExtractorPrompt,
  buildAuditorPrompt,
  buildDrafterPrompt,
  PromptContext,
} from "./specialist-prompts";

export interface AgentProgressEvent {
  type: "step_start" | "step_complete" | "token" | "citation" | "approval_required" | "refusal" | "twist_evaluation" | "done" | "error";
  agent?: string;
  stepIndex?: number;
  message?: string;
  data?: unknown;
  token?: string;
  finalAnswer?: string;
}

export type WorkflowResult = {
  finalAnswer: string;
  citations: Citation[];
  status: Run["status"];
  refusalReason?: string;
  approvalId?: string;
};

/**
 * Intermediate state persisted between pause and resume.
 * Stored in memory keyed by runId so resumeWorkflow can continue.
 */
export interface PausedWorkflowState {
  runId: string;
  query: string;
  sessionId: string;
  correlationId: string;
  extractorOutput: ExtractorOutput;
  auditorOutput: AuditorOutput;
  evidenceContext: string;
  retrievalCitations: Citation[];
  evidenceScores: number[];
  approvalId: string;
  stepIndex: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  filters?: RetrievalScopeFilter;
}

/**
 * Creates a timeout promise that rejects after given ms with StepTimeoutError.
 */
function createStepTimeout(ms: number, agentName: string): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new StepTimeoutError(
        `${agentName} exceeded step timeout of ${ms}ms. Circuit breaker activated.`
      ));
    }, ms);
  });
  const clear = () => clearTimeout(timer);
  return { promise, clear };
}

declare global {
  var __orchestratorPausedStatesInstance: Map<string, PausedWorkflowState> | undefined;
}

const globalPausedStates =
  globalThis.__orchestratorPausedStatesInstance ?? new Map<string, PausedWorkflowState>();
if (process.env.NODE_ENV !== "production") {
  globalThis.__orchestratorPausedStatesInstance = globalPausedStates;
}

export interface MultiAgentOrchestratorOptions {
  stepTimeoutMs?: number;
}

export class MultiAgentOrchestrator {
  private readonly MAX_ITERATIONS = 5;
  private readonly stepTimeoutMs: number;

  /**
   * In-memory store for paused workflow state.
   * Keyed by runId. Cleared on resume or failure.
   */
  private pausedStates: Map<string, PausedWorkflowState> = globalPausedStates;

  constructor(
    private db: IDatabasePort,
    private aiProvider: IAIProviderPort,
    private retriever: HybridRetrievalService,
    private tools: ToolRegistry,
    private approvalService: ApprovalService,
    private twistPort: ITwistPort,
    options?: MultiAgentOrchestratorOptions
  ) {
    this.stepTimeoutMs =
      options?.stepTimeoutMs ??
      (process.env.STEP_TIMEOUT_MS ? parseInt(process.env.STEP_TIMEOUT_MS, 10) : 30000);
  }

  /**
   * Check if a run is paused awaiting approval.
   */
  getPausedState(runId: string): PausedWorkflowState | undefined {
    return this.pausedStates.get(runId);
  }

  /**
   * Execute a single agent step with tool-calling loop.
   * Bounded by MAX_ITERATIONS to prevent infinite loops.
   * Each iteration enforced by stepTimeoutMs.
   */
  private async executeAgentWithTools(
    agentName: string,
    systemPrompt: string,
    runId: string,
    options?: { model?: string; temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const toolDefs = this.tools.getToolsForAgent(agentName);
    const messages: CompletionMessage[] = [
      { role: "system", content: systemPrompt, name: agentName.replace(/[^a-zA-Z0-9_-]/g, "_") },
    ];

    for (let iteration = 0; iteration < this.MAX_ITERATIONS; iteration++) {
      const timeout = createStepTimeout(this.stepTimeoutMs, agentName);

      try {
        const result = await Promise.race([
          this.aiProvider.generateCompletion(messages, {
            model: options?.model,
            temperature: options?.temperature ?? 0.1,
            maxTokens: options?.maxTokens,
            tools: toolDefs.length > 0 ? toolDefs : undefined,
          }),
          timeout.promise,
        ]);
        timeout.clear();

        // If no tool calls, return text response
        if (!result.toolCalls || result.toolCalls.length === 0) {
          return result.text;
        }

        // Process tool calls: execute each, feed results back
        messages.push({
          role: "assistant",
          content: result.text || "",
        });

        for (const toolCall of result.toolCalls) {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.arguments);
          } catch {
            args = {};
          }

          try {
            const { outcome } = await this.tools.executeTool(
              toolCall.name,
              args,
              { agentName, runId }
            );

            messages.push({
              role: "tool",
              content: JSON.stringify(outcome),
              toolCallId: toolCall.id,
              name: toolCall.name,
            });
          } catch (toolError: any) {
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: toolError.message }),
              toolCallId: toolCall.id,
              name: toolCall.name,
            });
          }
        }
      } catch (err) {
        timeout.clear();
        throw err;
      }
    }

    throw new ValidationError(
      `${agentName} exhausted iteration limit (${this.MAX_ITERATIONS}) without producing a final response. Circuit breaker activated.`
    );
  }

  /**
   * Execute agent, parse output with Zod, retry on validation failure.
   * Bounded by MAX_ITERATIONS total retries.
   */
  private async executeAndValidateAgent<T>(
    agentName: string,
    systemPrompt: string,
    schema: import("zod").ZodSchema<T>,
    runId: string,
    options?: { model?: string; temperature?: number; maxTokens?: number }
  ): Promise<{ validated: T; rawText: string }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_ITERATIONS; attempt++) {
      const rawText = await this.executeAgentWithTools(agentName, systemPrompt, runId, options);

      try {
        const validated = parseAgentOutput(schema, rawText, agentName);
        return { validated, rawText };
      } catch (err: any) {
        lastError = err;
        if (attempt < this.MAX_ITERATIONS - 1) {
          const correctedPrompt = systemPrompt +
            `\n\n[SYSTEM CORRECTION - Attempt ${attempt + 2}]: Your previous response failed schema validation: ${err.message}. Please respond with ONLY valid JSON matching the required schema.`;
          try {
            const retryText = await this.executeAgentWithTools(agentName, correctedPrompt, runId, options);
            const validated = parseAgentOutput(schema, retryText, agentName);
            return { validated, rawText: retryText };
          } catch (retryErr: any) {
            lastError = retryErr;
          }
        }
      }
    }

    throw new ValidationError(
      `${agentName} failed schema validation after ${this.MAX_ITERATIONS} attempts. Last error: ${lastError?.message}`
    );
  }

  /**
   * Helper: get specialist names based on active variant.
   */
  private getSpecialists(): [string, string, string] {
    return ACTIVE_VARIANT.domainName
      ? [
          "Clinical Evidence Extractor",
          "Contraindication & Safety Auditor",
          "Therapeutic Protocol Drafter",
        ]
      : ["Evidence Extractor", "Risk Auditor", "Response Drafter"];
  }

  /**
   * Helper to save step and notify UI.
   */
  private async createStep(
    runId: string,
    stepIndex: number,
    agent: string,
    stepType: RunStep["stepType"],
    emitEvent?: (event: AgentProgressEvent) => void,
    input?: unknown
  ): Promise<RunStep> {
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
  }

  /**
   * Helper to finish step.
   */
  private async completeStep(
    step: RunStep,
    output: unknown,
    latencyMs: number,
    emitEvent?: (event: AgentProgressEvent) => void
  ) {
    await this.db.updateRunStep(step.id, "COMPLETED", output, latencyMs);
    emitEvent?.({
      type: "step_complete",
      agent: step.agent,
      stepIndex: step.stepIndex,
      data: output,
    });
  }

  /**
   * Execute the Drafter phase (shared by initial workflow and resume).
   */
  private async executeDrafterPhase(
    runId: string,
    query: string,
    correlationId: string,
    auditorOutput: AuditorOutput,
    evidenceContext: string,
    retrievalCitations: Citation[],
    stepIndex: number,
    totalPromptTokens: number,
    totalCompletionTokens: number,
    emitEvent?: (event: AgentProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<WorkflowResult> {
    const specialists = this.getSpecialists();

    const baseContext: Omit<PromptContext, "previousOutput" | "auditOutput"> = {
      domainName: ACTIVE_VARIANT.domainName,
      domainRiskPolicy: ACTIVE_VARIANT.domainRiskPolicy,
      query,
      evidenceContext,
    };

    // Step: Domain Specialist 3 - Drafting Agent with Streaming (AGT-005 / RT-001)
    const startS3 = Date.now();
    const s3Step = await this.createStep(runId, stepIndex + 1, specialists[2], "AGENT_EXECUTION", emitEvent);

    const s3Prompt = buildDrafterPrompt({
      ...baseContext,
      auditOutput: JSON.stringify(auditorOutput, null, 2),
      availableTools: this.tools.getToolNamesForAgent(specialists[2]),
    });

    let finalSynthesis = "";
    let streamRes: CompletionResult | undefined;
    const streamTimeout = createStepTimeout(this.stepTimeoutMs, specialists[2]);

    try {
      streamRes = await Promise.race([
        this.aiProvider.streamCompletion(
          [
            { role: "system", content: s3Prompt },
            { role: "user", content: query },
          ],
          (token) => {
            finalSynthesis += token;
            emitEvent?.({ type: "token", token });
          },
          { signal }
        ),
        streamTimeout.promise,
      ]);
      streamTimeout.clear();

      totalPromptTokens += streamRes.promptTokens;
      totalCompletionTokens += streamRes.completionTokens;
    } catch (err) {
      streamTimeout.clear();
      throw err;
    }

    // Validate drafter output with Zod (AGT-001)
    let drafterOutput: DrafterOutput;
    try {
      drafterOutput = parseAgentOutput(DrafterOutputSchema, finalSynthesis, specialists[2]);
    } catch {
      drafterOutput = {
        synthesis: finalSynthesis,
        citationsUsed: retrievalCitations.map((c) => c.chunkId),
      };
    }

    await this.completeStep(s3Step, { synthesisLength: drafterOutput.synthesis.length }, Date.now() - startS3, emitEvent);

    // Record Cost & Tokens (OBS-002)
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const totalCostUsd =
      typeof this.aiProvider.calculateCost === "function"
        ? this.aiProvider.calculateCost(totalPromptTokens, totalCompletionTokens)
        : (totalPromptTokens / 1_000_000) * 2.50 + (totalCompletionTokens / 1_000_000) * 10.00;

    await this.db.recordUsage({
      id: `usage-${runId}`,
      runId,
      correlationId,
      provider: this.aiProvider.providerName,
      model: streamRes?.model || process.env.AI_MODEL || "gpt-4o",
      callType: "COMPLETION",
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens,
      costUsd: Math.round(totalCostUsd * 100000) / 100000,
      createdAt: new Date().toISOString(),
    });

    // Mark Run Completed
    const finalAnswer = drafterOutput.synthesis;
    const completedRun = await this.db.getRunById(runId);
    if (completedRun) {
      completedRun.citations = retrievalCitations;
    }
    await this.db.updateRunStatus(runId, "COMPLETED", undefined, finalAnswer);
    emitEvent?.({
      type: "done",
      finalAnswer,
      data: {
        totalTokens,
        totalCostUsd,
        citationsCount: retrievalCitations.length,
        finalAnswer,
      },
    });

    return {
      finalAnswer,
      citations: retrievalCitations,
      status: "COMPLETED",
    };
  }

  /**
   * Main workflow entry point. Runs Retrieval -> Extractor -> Auditor.
   * If auditor flags requiresHumanReview, creates an approval and PAUSES.
   * Otherwise continues to Drafter and completes.
   */
  async runWorkflow(
    runId: string,
    query: string,
    sessionId: string,
    correlationId: string,
    emitEvent?: (event: AgentProgressEvent) => void,
    signal?: AbortSignal,
    filters?: RetrievalScopeFilter
  ): Promise<WorkflowResult> {
    const specialists = this.getSpecialists();

    let stepIndex = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    try {
      // Step 1: Retrieval Phase
      const startRet = Date.now();
      const retStep = await this.createStep(runId, ++stepIndex, "Retrieval Engine", "RETRIEVAL", emitEvent, { query, filters });
      const retrievalResult: RetrievalResult = await this.retriever.retrieve(query, filters, correlationId);
      await this.completeStep(retStep, retrievalResult.trace, Date.now() - startRet, emitEvent);

      // Persist citations on run record for inspection / rehydration
      const runForCitations = await this.db.getRunById(runId);
      if (runForCitations) {
        runForCitations.citations = retrievalResult.citations;
      }

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
        emitEvent?.({
          type: "done",
          data: {
            refusal: true,
            refusalReason,
          },
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

      const baseContext: Omit<PromptContext, "previousOutput" | "auditOutput"> = {
        domainName: ACTIVE_VARIANT.domainName,
        domainRiskPolicy: ACTIVE_VARIANT.domainRiskPolicy,
        query,
        evidenceContext,
      };

      // Step 2: Domain Specialist 1 - Evidence Extractor (AGT-003)
      const startS1 = Date.now();
      const s1Step = await this.createStep(runId, ++stepIndex, specialists[0], "AGENT_EXECUTION", emitEvent);

      const s1Prompt = buildExtractorPrompt({
        ...baseContext,
        availableTools: this.tools.getToolNamesForAgent(specialists[0]),
      });

      const { validated: extractorOutput } = await this.executeAndValidateAgent(
        specialists[0],
        s1Prompt,
        ExtractorOutputSchema,
        runId,
        { temperature: 0.1, maxTokens: 600 }
      );

      await this.completeStep(s1Step, { findings: extractorOutput }, Date.now() - startS1, emitEvent);

      // Step 3: Domain Specialist 2 - Risk & Compliance Auditor (AGT-004)
      const startS2 = Date.now();
      const s2Step = await this.createStep(runId, ++stepIndex, specialists[1], "AGENT_EXECUTION", emitEvent);

      const s2Prompt = buildAuditorPrompt({
        ...baseContext,
        previousOutput: JSON.stringify(extractorOutput, null, 2),
        availableTools: this.tools.getToolNamesForAgent(specialists[1]),
      });

      const { validated: auditorOutput } = await this.executeAndValidateAgent(
        specialists[1],
        s2Prompt,
        AuditorOutputSchema,
        runId,
        { temperature: 0.1 }
      );

      await this.completeStep(s2Step, { audit: auditorOutput }, Date.now() - startS2, emitEvent);

      // ═══════════════════════════════════════════════════════════════
      // TW-002 / TW-004: Mandatory Twist Risk Guard Evaluation
      // Programmatically asserts the assigned Twist risk policy & floor
      // ═══════════════════════════════════════════════════════════════
      const startTwist = Date.now();
      const twistStep = await this.createStep(
        runId,
        ++stepIndex,
        `Mandatory Twist Guard (${this.twistPort.twistName})`,
        "GUARDRAIL",
        emitEvent,
        { policy: ACTIVE_VARIANT.domainRiskPolicy, threshold: ACTIVE_VARIANT.riskThreshold }
      );

      // Extract candidate evidence confidence scores from retrieval results
      const evidenceScores = retrievalResult.chunks.map((c) => {
        const fusedMatch = retrievalResult.trace.fusedResults.find((f) => f.chunkId === c.id);
        return fusedMatch ? Math.min(1.0, Math.max(0.1, fusedMatch.rrfScore * 35)) : 0.85;
      });

      const proposedActionName = auditorOutput.proposedAction || "synthesize_protocol_guidance";
      const twistResult = this.twistPort.evaluateRiskGuard({
        actionName: proposedActionName,
        payload: {
          query,
          riskFlags: auditorOutput.riskFlags,
          proposedAction: proposedActionName,
        },
        evidenceScores,
        requesterRole: specialists[1],
      });

      await this.completeStep(twistStep, twistResult, Date.now() - startTwist, emitEvent);

      emitEvent?.({
        type: "twist_evaluation",
        agent: `Mandatory Twist Guard (${this.twistPort.twistName})`,
        message: twistResult.isPermitted
          ? `Twist guard passed: Risk Index ${twistResult.computedRiskIndex} < Threshold ${twistResult.threshold}`
          : `Twist guard tripped: Risk Index ${twistResult.computedRiskIndex} >= Threshold ${twistResult.threshold} (${twistResult.violations.join("; ")})`,
        data: twistResult,
      });

      // TW-002: Deterministic enforcement point
      // If twist guard blocks the operation, force HITL review or escalation even if LLM missed it
      if (!twistResult.isPermitted) {
        auditorOutput.requiresHumanReview = true;
        auditorOutput.riskFlags.unshift({
          riskType: "TWIST_RISK_GUARD_VIOLATION",
          severity: "CRITICAL",
          detail: `[Mandatory Twist Guard (${this.twistPort.twistName})]: ${twistResult.violations.join("; ")} (Computed Risk Index: ${twistResult.computedRiskIndex}, Ceiling: ${twistResult.threshold})`,
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // HITL-001/002: If auditor requires human review, CREATE approval and PAUSE
      // ═══════════════════════════════════════════════════════════════
      if (auditorOutput.requiresHumanReview) {
        // Create HITL approval gate step
        const gateStep = await this.createStep(runId, ++stepIndex, "HITL Approval Gate", "APPROVAL_GATE", emitEvent, {
          riskFlags: auditorOutput.riskFlags,
          requiresHumanReview: true,
        });

        // Determine proposed action description from risk flags
        const highestRisk = auditorOutput.riskFlags.reduce(
          (max, flag) => {
            const order = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
            return (order[flag.severity] || 0) > (order[max.severity] || 0) ? flag : max;
          },
          auditorOutput.riskFlags[0]
        );

        const proposedAction = auditorOutput.proposedAction ||
          `Proceed with response despite ${highestRisk?.severity || "HIGH"} risk: ${highestRisk?.detail || "Auditor flagged risk requiring human review"}`;

        // HITL-001: Persist approval via ApprovalService
        const approval = await this.approvalService.createApprovalRequest({
          runId,
          proposedAction,
          riskLevel: highestRisk?.severity || "HIGH",
          requesterAgent: specialists[1],
          payload: {
            extractorOutput,
            auditorOutput,
            query,
            evidenceContext: evidenceContext.slice(0, 2000), // Truncate for storage
          },
        });

        // HITL-002: Set run status to APPROVAL_PENDING (workflow pauses)
        await this.db.updateRunStatus(runId, "APPROVAL_PENDING");

        // Mark gate step as pending
        await this.db.updateRunStep(gateStep.id, "RUNNING", {
          approvalId: approval.id,
          status: "AWAITING_HUMAN_DECISION",
        });

        // Save intermediate state for resume
        this.pausedStates.set(runId, {
          runId,
          query,
          sessionId,
          correlationId,
          extractorOutput,
          auditorOutput,
          evidenceContext,
          retrievalCitations: retrievalResult.citations,
          evidenceScores,
          approvalId: approval.id,
          stepIndex,
          totalPromptTokens,
          totalCompletionTokens,
          filters,
        });

        // Emit approval_required event with approval ID so client can track
        emitEvent?.({
          type: "approval_required",
          agent: specialists[1],
          message: `Workflow paused: ${proposedAction}`,
          data: {
            approvalId: approval.id,
            riskLevel: highestRisk?.severity || "HIGH",
            riskFlags: auditorOutput.riskFlags,
            proposedAction,
          },
        });

        // RETURN EARLY — workflow is paused
        return {
          finalAnswer: "",
          citations: retrievalResult.citations,
          status: "APPROVAL_PENDING",
          approvalId: approval.id,
        };
      }

      // ═══════════════════════════════════════════════════════════════
      // No HITL needed — proceed directly to Drafter
      // ═══════════════════════════════════════════════════════════════
      return await this.executeDrafterPhase(
        runId,
        query,
        correlationId,
        auditorOutput,
        evidenceContext,
        retrievalResult.citations,
        stepIndex,
        totalPromptTokens,
        totalCompletionTokens,
        emitEvent,
        signal
      );
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

  /**
   * HITL-003/004: Resume a paused workflow after human approval decision.
   * Called when a human approves, edits-and-approves, or rejects.
   */
  async resumeWorkflow(
    runId: string,
    approvalId: string,
    emitEvent?: (event: AgentProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<WorkflowResult> {
    let pausedState = this.pausedStates.get(runId);
    if (!pausedState) {
      const approvalRec = await this.db.getApprovalById(approvalId);
      const runRec = await this.db.getRunById(runId);
      if (approvalRec && runRec && approvalRec.originalPayload) {
        const payload = approvalRec.originalPayload as any;
        if (payload.auditorOutput) {
          pausedState = {
            runId,
            query: runRec.query,
            sessionId: runRec.sessionId,
            correlationId: runRec.correlationId,
            extractorOutput: payload.extractorOutput,
            auditorOutput: payload.auditorOutput,
            evidenceContext: payload.evidenceContext || "",
            retrievalCitations: runRec.citations || [],
            evidenceScores: [],
            approvalId: approvalRec.id,
            stepIndex: 5,
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            filters: runRec.filters as any,
          };
          this.pausedStates.set(runId, pausedState);
        }
      }
    }

    if (!pausedState) {
      throw new ValidationError(
        `No paused workflow found for run "${runId}". The run may have already completed or expired.`
      );
    }

    // Fetch approval decision
    const approval = await this.db.getApprovalById(approvalId);
    if (!approval) {
      throw new ValidationError(`Approval "${approvalId}" not found.`);
    }

    // Complete the HITL gate step
    const gateStepId = `step-${runId}-${pausedState.stepIndex}`;
    await this.db.updateRunStep(gateStepId, "COMPLETED", {
      approvalId,
      decision: approval.status,
      reviewerId: approval.reviewerId,
      decisionComment: approval.decisionComment,
    });

    emitEvent?.({
      type: "step_complete",
      agent: "HITL Approval Gate",
      stepIndex: pausedState.stepIndex,
      data: { decision: approval.status },
    });

    try {
      // HITL-003: Handle rejection — mark run as REFUSED
      if (approval.status === "REJECTED") {
        const refusalReason = `Human reviewer rejected: ${approval.decisionComment || "No reason provided"}`;
        await this.db.updateRunStatus(runId, "REFUSED", refusalReason, refusalReason);
        this.pausedStates.delete(runId);

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

      // HITL-004: Handle approval — execute any proposed tool action, then continue to Drafter
      let auditorOutput = pausedState.auditorOutput;

      // If edit-and-approved, merge the modified payload back
      if (approval.status === "EDIT_APPROVED" && approval.approvedPayload) {
        // The edited payload may contain modified auditor output
        if (approval.approvedPayload.auditorOutput) {
          auditorOutput = approval.approvedPayload.auditorOutput as AuditorOutput;
        }
      }

      // Execute proposed tool action if the auditor suggested one
      if (auditorOutput.proposedAction) {
        const toolStep = await this.createStep(
          runId,
          pausedState.stepIndex + 1,
          "HITL Tool Executor",
          "TOOL_CALL",
          emitEvent,
          { toolAction: auditorOutput.proposedAction, approvalId }
        );

        try {
          const toolPayload = approval.approvedPayload || approval.originalPayload;
          await this.tools.executeTool(
            "execute_protocol_update",
            toolPayload,
            {
              agentName: "Supervisor",
              runId,
              approvalToken: approvalId,
              isPreApproved: true,
              evidenceScores: pausedState.evidenceScores,
            }
          );
          await this.completeStep(toolStep, { status: "EXECUTED", approvalId }, 0, emitEvent);
        } catch (toolErr: any) {
          await this.db.updateRunStep(toolStep.id, "FAILED", { error: toolErr.message });
          // Continue to drafter even if tool execution fails — log the error
        }
      }

      // Update run status back to STREAMING
      await this.db.updateRunStatus(runId, "STREAMING");

      // Continue to Drafter phase
      const result = await this.executeDrafterPhase(
        runId,
        pausedState.query,
        pausedState.correlationId,
        auditorOutput,
        pausedState.evidenceContext,
        pausedState.retrievalCitations,
        pausedState.stepIndex + 1,
        pausedState.totalPromptTokens,
        pausedState.totalCompletionTokens,
        emitEvent,
        signal
      );

      // Cleanup paused state
      this.pausedStates.delete(runId);

      return result;
    } catch (err: any) {
      this.pausedStates.delete(runId);

      if (signal?.aborted) {
        await this.db.updateRunStatus(runId, "CANCELLED");
        emitEvent?.({ type: "error", message: "Resumed workflow cancelled by client." });
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
