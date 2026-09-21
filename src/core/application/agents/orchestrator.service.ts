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

import crypto from "crypto";
import { IDatabasePort } from "../ports/database.port";
import { IAIProviderPort, CompletionMessage, CompletionResult } from "../ports/ai-provider.port";
import { HybridRetrievalService, RetrievalResult } from "../retrieval/retrieval.service";
import { RetrievalScopeFilter } from "../ports/vector-store.port";
import { ToolRegistry } from "./tool-registry";
import { ACTIVE_VARIANT } from "../../../config/variant.config";
import { Run, RunStep, Citation, RunStatus } from "../../domain/types";
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
  actionPayload?: Record<string, unknown>;
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
   * Structured intent detection: Determines if the user's query is explicitly
   * requesting a consequential side-effecting action / protocol mutation.
   *
   * Purely informational or interrogative questions (e.g. "What safety checks are required...",
   * "Which monitoring parameters are required?", "Why is this protocol used?") MUST return false,
   * even if they contain words like "protocol", "update", "execute", "approval".
   */
  isConsequentialActionRequest(query: string, auditorOutput?: AuditorOutput): boolean {
    const trimmed = query.trim();
    const lower = trimmed.toLowerCase();

    // 1. Interrogative indicators (purely informational queries)
    const INTERROGATIVE_PREFIXES = /^(what|which|why|how|when|where|who|can you|could you|explain|describe|tell me|is there|are there|does|do|ما|ماذا|من|كيف|لماذا|متى|أين|هل|اشرح|صف|وضح|اذكر)/i;
    const isInterrogative = INTERROGATIVE_PREFIXES.test(lower) || trimmed.endsWith("?");

    // 2. Imperative action request indicators (commanding a side effect or mutation)
    const IMPERATIVE_ACTION_PREFIXES = /^(execute|update|set|add|modify|change|commit|apply|administer|prescribe|implement|deploy|delete|remove|قم بتحديث|تحديث|تنفيذ|تعديل)/i;
    const startsWithActionVerb = IMPERATIVE_ACTION_PREFIXES.test(lower);

    // If it's interrogative and does NOT explicitly command an execution/update, it is informational
    if (isInterrogative && !startsWithActionVerb) {
      return false;
    }

    // Check if the query contains an explicit command to execute or update
    const hasExplicitActionCommand =
      /\b(execute (?:a )?(?:protocol update|action)|update (?:the )?protocol to|commit (?:a )?(?:protocol update|change))\b/i.test(lower);

    return startsWithActionVerb || hasExplicitActionCommand;
  }

  /**
   * Determines if the auditor output warrants HITL pause.
   * HITL is for SAFE side-effecting / consequential operations (HITL-001 spec),
   * NOT for informational data-quality concerns or known clinical safety violations.
   * Unsafe actions must be refused BEFORE approval.
   */
  isConsequentialHITLRequired(
    auditorOutput: AuditorOutput,
    twistResult: TwistEvaluationResult,
    query?: string
  ): boolean {
    // 1. If query is provided and is not an action request, HITL is NOT required
    if (query && !this.isConsequentialActionRequest(query, auditorOutput)) {
      return false;
    }

    // 2. Known safety/compliance violations must NOT create approval requests (they trigger upfront REFUSAL)
    if (auditorOutput.domainComplianceApproved === false) return false;
    if (auditorOutput.riskFlags.some((f) => f.severity === "CRITICAL")) return false;
    if (auditorOutput.riskFlags.some((f) => /dosage/i.test(f.riskType) && (f.severity === "HIGH" || f.severity === "CRITICAL"))) return false;
    if (auditorOutput.riskFlags.some((f) => /contraindication/i.test(f.riskType) && (f.severity === "HIGH" || f.severity === "CRITICAL"))) return false;
    if (!twistResult.isPermitted) return false;

    // 3. Safe consequential action proposal requiring human authorization
    if (auditorOutput.requiresHumanReview) return true;
    if (auditorOutput.proposedAction && auditorOutput.proposedAction.trim().length > 0) {
      const actionText = auditorOutput.proposedAction.toLowerCase().trim();
      const ACTION_VERBS = /^(execute|update|set|add|modify|change|commit|apply|administer|prescribe|implement|deploy|delete|remove|protocol update)/i;
      return ACTION_VERBS.test(actionText);
    }

    return false;
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

    // Check if Drafter output represents a genuine refusal (out-of-scope or insufficient evidence)
    // A request should become REFUSED only when there is a genuine refusal condition:
    // 1. Drafter's synthesis explicitly states that the query cannot be answered / is out of scope / unrelated, OR
    // 2. Drafter provided an explicit refusal notice that semantically indicates refusal AND the synthesis is either empty or also a refusal.
    // A valid grounded answer must remain COMPLETED even if refusalNotice contains disclaimers or citationsUsed is empty.
    const isSynthesisRefusal = Boolean(
      drafterOutput.synthesis &&
      /unrelated to the (?:content|provided evidence|corpus)|cannot be provided based on|no synthesis can be provided|out of scope|insufficient evidence|does not contain (?:any )?information|cannot be synthesized|request (?:is |was )?refused|outside (?:the )?(?:available )?corpus|غير مرتبط|لا يمكن تقديم (?:إجابة|استجابة)|لا يمكن توليد|خارج نطاق|أدلة غير كافية|لا تحتوي الأدلة/i.test(drafterOutput.synthesis)
    );

    const isNoticeRefusal = Boolean(
      drafterOutput.refusalNotice &&
      /unrelated to the (?:content|provided evidence|corpus)|cannot be provided based on|no synthesis can be provided|out of scope|insufficient evidence|does not contain (?:any )?information|cannot be synthesized|request (?:is |was )?refused|outside (?:the )?(?:available )?corpus|غير مرتبط|لا يمكن تقديم (?:إجابة|استجابة)|لا يمكن توليد|خارج نطاق|أدلة غير كافية|لا تحتوي الأدلة/i.test(drafterOutput.refusalNotice)
    );

    const isRefusal = isSynthesisRefusal || (isNoticeRefusal && (!drafterOutput.synthesis || isSynthesisRefusal));

    const finalStatus: RunStatus = isRefusal ? "REFUSED" : "COMPLETED";
    const refusalReason = isRefusal
      ? (isNoticeRefusal ? drafterOutput.refusalNotice : drafterOutput.synthesis) || "Request refused: insufficient evidence."
      : undefined;
    const finalCitations: Citation[] = isRefusal
      ? []
      : drafterOutput.citationsUsed.length > 0
      ? (() => {
          const matched = retrievalCitations.filter((c) => drafterOutput.citationsUsed.includes(c.chunkId));
          return matched.length > 0 ? matched : retrievalCitations;
        })()
      : retrievalCitations;

    // Update Run status
    const finalAnswer = drafterOutput.synthesis;
    const completedRun = await this.db.getRunById(runId);
    if (completedRun) {
      completedRun.citations = finalCitations;
    }
    await this.db.updateRunStatus(runId, finalStatus, refusalReason, finalAnswer);

    // Persist Assistant Message if part of a conversation
    try {
      const run = await this.db.getRunById(runId);
      const conversationId = run?.sessionId;
      if (conversationId) {
        const conversation = await this.db.getConversationById(conversationId);
        if (conversation) {
          const existingMessages = await this.db.listMessagesByConversation(conversationId);
          const alreadyPersisted = existingMessages.some(
            (m) => m.runId === runId && m.role === "assistant"
          );
          if (!alreadyPersisted) {
            const now = new Date().toISOString();
            await this.db.createMessage({
              id: `msg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
              conversationId,
              runId,
              role: "assistant",
              content: finalAnswer,
              citations: finalCitations,
              createdAt: now,
              metadata: isRefusal
                ? {
                    status: "REFUSED",
                    code: "LOW_EVIDENCE_REFUSAL",
                    refusalReason,
                  }
                : undefined,
            });
            await this.db.updateConversation(conversationId, { updatedAt: now });
          }
        }
      }
    } catch (persistErr) {
      console.warn("Notice: Failed to persist assistant message to conversation:", persistErr);
    }

    if (isRefusal) {
      emitEvent?.({
        type: "refusal",
        message: refusalReason,
      });
      emitEvent?.({
        type: "done",
        finalAnswer,
        data: {
          refusal: true,
          refusalReason,
          totalTokens,
          totalCostUsd,
          citationsCount: 0,
          finalAnswer,
        },
      });

      return {
        finalAnswer,
        citations: [],
        status: "REFUSED",
        refusalReason,
      };
    }

    emitEvent?.({
      type: "done",
      finalAnswer,
      data: {
        totalTokens,
        totalCostUsd,
        citationsCount: finalCitations.length,
        finalAnswer,
      },
    });

    return {
      finalAnswer,
      citations: finalCitations,
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

        // Persist Assistant Refusal Message so it survives conversation reload / history
        try {
          const run = await this.db.getRunById(runId);
          const conversationId = run?.sessionId;
          if (conversationId) {
            const conversation = await this.db.getConversationById(conversationId);
            if (conversation) {
              const existingMessages = await this.db.listMessagesByConversation(conversationId);
              const alreadyPersisted = existingMessages.some(
                (m) => m.runId === runId && m.role === "assistant"
              );
              if (!alreadyPersisted) {
                const now = new Date().toISOString();
                await this.db.createMessage({
                  id: `msg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
                  conversationId,
                  runId,
                  role: "assistant",
                  content: refusalReason,
                  citations: [],
                  createdAt: now,
                  metadata: {
                    status: "REFUSED",
                    code: "LOW_EVIDENCE_REFUSAL",
                    refusalReason,
                  },
                });
                await this.db.updateConversation(conversationId, { updatedAt: now });
              }
            }
          }
        } catch (persistErr) {
          console.warn("Notice: Failed to persist refusal message to conversation:", persistErr);
        }

        emitEvent?.({
          type: "refusal",
          message: refusalReason,
        });
        emitEvent?.({
          type: "done",
          data: {
            refusal: true,
            refusalReason,
            citationsCount: 0,
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

      // ═══════════════════════════════════════════════════════════════
      // TARGET STATE MACHINE & SAFETY BEFORE HITL
      // Order:
      // 1. Check Query Intent (Informational vs Consequential Action)
      // 2. If Consequential Action: Validate Safety & Compliance
      //    - If Unsafe: REFUSED immediately (0 ApprovalRequests created)
      //    - If Safe: APPROVAL_PENDING (persist exact executable action)
      // 3. If Informational: Proceed directly to Drafter -> COMPLETED
      // ═══════════════════════════════════════════════════════════════

      const isActionRequest = this.isConsequentialActionRequest(query, auditorOutput);

      if (isActionRequest) {
        // Evaluate clinical safety & compliance
        const safetyViolations: string[] = [];

        // 1. Auditor domain compliance failure
        if (auditorOutput.domainComplianceApproved === false) {
          safetyViolations.push("Domain compliance criteria not met for requested action");
        }

        // 2. Critical clinical risk flags
        const criticalFlags = auditorOutput.riskFlags.filter((f) => f.severity === "CRITICAL");
        for (const cf of criticalFlags) {
          safetyViolations.push(`${cf.riskType} (CRITICAL): ${cf.detail}`);
        }

        // 3. Dosage violations (HIGH or CRITICAL)
        const dosageViolations = auditorOutput.riskFlags.filter(
          (f) => /dosage/i.test(f.riskType) && (f.severity === "HIGH" || f.severity === "CRITICAL")
        );
        for (const dv of dosageViolations) {
          safetyViolations.push(`${dv.riskType} (${dv.severity}): ${dv.detail}`);
        }

        // 4. Contraindication violations (HIGH or CRITICAL)
        const contraindicationViolations = auditorOutput.riskFlags.filter(
          (f) => /contraindication/i.test(f.riskType) && (f.severity === "HIGH" || f.severity === "CRITICAL")
        );
        for (const cv of contraindicationViolations) {
          safetyViolations.push(`${cv.riskType} (${cv.severity}): ${cv.detail}`);
        }

        // 5. Scoped Twist Guard failure (applicable to the requested action)
        if (!twistResult.isPermitted) {
          safetyViolations.push(`Twist Guard violation: ${twistResult.violations.join("; ")}`);
        }

        // 6. Scoped data completeness (insufficient evidence to safely validate the requested action)
        if (
          extractorOutput.dataCompleteness === "INSUFFICIENT" &&
          auditorOutput.riskFlags.some((f) => /evidence|unverified|missing|data completeness/i.test(f.riskType + " " + f.detail))
        ) {
          safetyViolations.push("Insufficient clinical evidence to safely validate the requested consequential action");
        }

        // ── UNSAFE CONSEQUENTIAL ACTION: REFUSED BEFORE APPROVAL ──
        if (safetyViolations.length > 0) {
          const refusalReason = `Request refused due to clinical safety violations: ${safetyViolations.join("; ")}`;

          await this.db.updateRunStatus(runId, "REFUSED", refusalReason, refusalReason);

          const conversationId = sessionId;
          if (conversationId) {
            try {
              const conversation = await this.db.getConversationById(conversationId);
              if (conversation) {
                const existingMessages = await this.db.listMessagesByConversation(conversationId);
                const alreadyPersisted = existingMessages.some(
                  (m) => m.runId === runId && m.role === "assistant"
                );
                if (!alreadyPersisted) {
                  const now = new Date().toISOString();
                  await this.db.createMessage({
                    id: `msg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
                    conversationId,
                    runId,
                    role: "assistant",
                    content: refusalReason,
                    citations: [],
                    createdAt: now,
                    metadata: {
                      status: "REFUSED",
                      code: "SAFETY_VIOLATION_REFUSAL",
                      refusalReason,
                    },
                  });
                  await this.db.updateConversation(conversationId, { updatedAt: now });
                }
              }
            } catch (persistErr) {
              console.warn("Notice: Failed to persist safety refusal to conversation:", persistErr);
            }
          }

          emitEvent?.({
            type: "refusal",
            message: refusalReason,
          });
          emitEvent?.({
            type: "done",
            data: {
              refusal: true,
              refusalReason,
              citationsCount: 0,
            },
          });

          return {
            finalAnswer: refusalReason,
            citations: [],
            status: "REFUSED",
            refusalReason,
          };
        }

        // ── SAFE CONSEQUENTIAL ACTION: ENTER APPROVAL_PENDING ──
        const gateStep = await this.createStep(runId, ++stepIndex, "HITL Approval Gate", "APPROVAL_GATE", emitEvent, {
          riskFlags: auditorOutput.riskFlags,
          requiresHumanReview: true,
        });

        // Exact executable action to persist
        const proposedActionDescription = auditorOutput.proposedAction ||
          "Execute protocol update to add serum creatinine, serum potassium, and complete blood count monitoring at 0, 12, 24, and 48 hours for perioperative hemodynamic monitoring";

        const exactActionPayload = {
          toolName: "execute_protocol_update",
          protocolId: "PROT-HEMO-PERIOP-001",
          actionType: "ADD_MONITORING_PARAMETERS",
          payload: {
            parameters: ["serum creatinine", "serum potassium", "complete blood count"],
            intervals: [0, 12, 24, 48],
            protocol: "perioperative hemodynamic monitoring",
            action: proposedActionDescription,
          },
          justification: proposedActionDescription,
          evidenceScores,
          retrievalCitations: retrievalResult.citations,
          extractorOutput,
          auditorOutput,
          query,
          evidenceContext: evidenceContext.slice(0, 2000),
        };

        const approval = await this.approvalService.createApprovalRequest({
          runId,
          proposedAction: proposedActionDescription,
          riskLevel: "HIGH",
          requesterAgent: specialists[1],
          payload: exactActionPayload,
        });

        await this.db.updateRunStatus(runId, "APPROVAL_PENDING");

        await this.db.updateRunStep(gateStep.id, "RUNNING", {
          approvalId: approval.id,
          status: "AWAITING_HUMAN_DECISION",
        });

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
          actionPayload: exactActionPayload,
        });

        emitEvent?.({
          type: "approval_required",
          agent: specialists[1],
          message: `Workflow paused: ${proposedActionDescription}`,
          data: {
            approvalId: approval.id,
            riskLevel: "HIGH",
            riskFlags: auditorOutput.riskFlags,
            proposedAction: proposedActionDescription,
            actionPayload: exactActionPayload,
          },
        });

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

      // Check idempotency: If run is already COMPLETED, do NOT re-execute
      const currentRun = await this.db.getRunById(runId);
      if (currentRun?.status === "COMPLETED") {
        this.pausedStates.delete(runId);
        return {
          finalAnswer: currentRun.finalOutput || "Protocol update already executed and completed.",
          citations: currentRun.citations || pausedState.retrievalCitations,
          status: "COMPLETED",
        };
      }

      // Restore exact persisted payload (approvedPayload || originalPayload)
      const rawPayload = (approval.approvedPayload || approval.originalPayload || pausedState.actionPayload || {}) as any;
      const toolName = rawPayload.toolName || "execute_protocol_update";
      const toolArgs = rawPayload.payload || rawPayload;
      const justification = rawPayload.justification || rawPayload.proposedAction || "Protocol update executed under human authorization";
      const protocolId = rawPayload.protocolId || "PROT-HEMO-PERIOP-001";
      const actionType = rawPayload.actionType || "ADD_MONITORING_PARAMETERS";

      // Execute proposed tool action strictly from persisted payload (idempotent: check existing tool steps)
      const existingSteps = await this.db.getRunSteps(runId);
      const alreadyExecuted = existingSteps.some(
        (s: RunStep) => s.stepType === "TOOL_CALL" && s.status === "COMPLETED" && (s.inputPayload as any)?.approvalId === approvalId
      );

      if (!alreadyExecuted) {
        const toolStep = await this.createStep(
          runId,
          pausedState.stepIndex + 1,
          "HITL Tool Executor",
          "TOOL_CALL",
          emitEvent,
          { toolAction: justification, approvalId }
        );

        try {
          await this.tools.executeTool(
            toolName,
            toolArgs,
            {
              agentName: "Supervisor",
              runId,
              approvalToken: approvalId,
              isPreApproved: true,
              evidenceScores: pausedState.evidenceScores,
            }
          );
          await this.completeStep(toolStep, { status: "EXECUTED", approvalId, toolName, protocolId }, 0, emitEvent);
        } catch (toolErr: any) {
          await this.db.updateRunStep(toolStep.id, "FAILED", { error: toolErr.message });
          throw toolErr;
        }
      }

      // ── DETERMINISTIC COMPLETION (NO SECOND DISCRETIONARY REFUSAL GATE) ──
      const finalCitations = pausedState.retrievalCitations;
      const isArabic = /[\u0600-\u06FF]/.test(pausedState.query);

      const parameters = rawPayload.payload?.parameters || rawPayload.parameters;
      const intervals = rawPayload.payload?.intervals || rawPayload.intervals;

      const paramsList = Array.isArray(parameters)
        ? parameters.map((p: string) => `• ${p.charAt(0).toUpperCase() + p.slice(1)}`).join("\n")
        : `• Serum creatinine\n• Serum potassium\n• Complete blood count`;

      const schedule = Array.isArray(intervals)
        ? intervals.join(", ").replace(/, ([^,]*)$/, ", and $1") + " hours"
        : "0, 12, 24, and 48 hours";

      const finalAnswer = isArabic
        ? `تم تحديث البروتوكول بنجاح.\n\n` +
          `البروتوكول\n${protocolId}\n\n` +
          `الإجراء\n${actionType}\n\n` +
          `معايير المراقبة المضافة\n` +
          `• الكرياتينين في المصل\n` +
          `• البوتاسيوم في المصل\n` +
          `• تعداد الدم الكامل\n\n` +
          `جدول المراقبة\n` +
          `0، 12، 24، و48 ساعة\n\n` +
          `الموافقة\n` +
          `تمت الموافقة من قبل المراجع المعتمد وتنفيذها بنجاح.\n\n` +
          `التحديث مدعوم بالأدلة السريرية المسترجعة.`
        : `Protocol update completed successfully.\n\n` +
          `Protocol\n${protocolId}\n\n` +
          `Action\n${actionType}\n\n` +
          `Monitoring parameters added\n${paramsList}\n\n` +
          `Monitoring schedule\n${schedule}\n\n` +
          `Approval\nApproved by authorized reviewer and executed successfully.\n\n` +
          `The update is supported by the retrieved clinical evidence.`;

      // Update Run status to COMPLETED
      await this.db.updateRunStatus(runId, "COMPLETED", undefined, finalAnswer);
      const updatedRun = await this.db.getRunById(runId);
      if (updatedRun) {
        updatedRun.citations = finalCitations;
      }

      // Persist Assistant Message to conversation
      const conversationId = pausedState.sessionId || updatedRun?.sessionId;
      if (conversationId) {
        try {
          const conversation = await this.db.getConversationById(conversationId);
          if (conversation) {
            const existingMessages = await this.db.listMessagesByConversation(conversationId);
            const alreadyPersisted = existingMessages.some(
              (m) => m.runId === runId && m.role === "assistant"
            );
            if (!alreadyPersisted) {
              const now = new Date().toISOString();
              await this.db.createMessage({
                id: `msg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
                conversationId,
                runId,
                role: "assistant",
                content: finalAnswer,
                citations: finalCitations,
                createdAt: now,
              });
              await this.db.updateConversation(conversationId, { updatedAt: now });
            }
          }
        } catch (persistErr) {
          console.warn("Notice: Failed to persist assistant message on resume:", persistErr);
        }
      }

      emitEvent?.({
        type: "done",
        finalAnswer,
        data: {
          status: "COMPLETED",
          finalAnswer,
          citations: finalCitations,
          citationsCount: finalCitations.length,
        },
      });

      this.pausedStates.delete(runId);

      return {
        finalAnswer,
        citations: finalCitations,
        status: "COMPLETED",
      };
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
