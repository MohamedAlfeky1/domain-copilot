/**
 * DOMAIN COPILOT - DATABASE REPOSITORY PORT
 * Persistence interface for relational records across the platform.
 */

import {
  Document,
  DocumentVersion,
  Chunk,
  IngestionJob,
  Run,
  RunStep,
  ToolCall,
  ApprovalRequest,
  ApprovalEvent,
  UsageRecord,
  User,
  EvaluationCase,
  EvaluationResult,
} from "../../domain/types";

export interface IDatabasePort {
  // Users
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  createUser(user: Omit<User, "id" | "createdAt">): Promise<User>;

  // Documents & Versions
  saveDocument(doc: Document): Promise<Document>;
  getDocumentById(id: string): Promise<Document | null>;
  getDocumentByHash(contentHash: string): Promise<Document | null>;
  listDocuments(): Promise<Document[]>;
  saveDocumentVersion(version: DocumentVersion): Promise<DocumentVersion>;
  getActiveVersion(documentId: string): Promise<DocumentVersion | null>;

  // Chunks
  saveChunks(chunks: Chunk[]): Promise<void>;
  getChunksByVersion(versionId: string): Promise<Chunk[]>;
  getChunkById(chunkId: string): Promise<Chunk | null>;
  countTotalChunks(): Promise<number>;

  // Ingestion Jobs
  saveIngestionJob(job: IngestionJob): Promise<IngestionJob>;
  updateIngestionJob(job: Partial<IngestionJob> & { id: string }): Promise<void>;
  listIngestionJobs(): Promise<IngestionJob[]>;

  // Runs & Traces
  saveRun(run: Run): Promise<Run>;
  getRunById(id: string): Promise<Run | null>;
  getRunByCorrelationId(correlationId: string): Promise<Run | null>;
  updateRunStatus(id: string, status: Run["status"], refusalReason?: string, finalOutput?: string): Promise<void>;
  listRuns(limit?: number): Promise<Run[]>;

  // Steps & Tools
  saveRunStep(step: RunStep): Promise<RunStep>;
  updateRunStep(stepId: string, status: RunStep["status"], outputPayload?: unknown, latencyMs?: number): Promise<void>;
  getRunSteps(runId: string): Promise<RunStep[]>;
  saveToolCall(toolCall: ToolCall): Promise<ToolCall>;
  updateToolCallOutcome(toolCallId: string, status: ToolCall["status"], outcome: unknown): Promise<void>;

  // Approvals & Audit
  saveApproval(approval: ApprovalRequest): Promise<ApprovalRequest>;
  getApprovalById(id: string): Promise<ApprovalRequest | null>;
  listApprovals(status?: ApprovalRequest["status"]): Promise<ApprovalRequest[]>;
  updateApproval(id: string, status: ApprovalRequest["status"], approvedPayload?: Record<string, unknown>, comment?: string, reviewerId?: string): Promise<void>;
  saveApprovalEvent(event: ApprovalEvent): Promise<void>;
  getApprovalEvents(approvalId: string): Promise<ApprovalEvent[]>;

  // Usage Ledger
  recordUsage(record: UsageRecord): Promise<void>;
  getUsageByRun(runId: string): Promise<UsageRecord[]>;
  getTotalUsage(): Promise<{ totalTokens: number; totalCostUsd: number; callCount: number }>;

  // Evaluation
  listEvaluationCases(): Promise<EvaluationCase[]>;
  saveEvaluationResult(result: EvaluationResult): Promise<void>;
  listEvaluationResults(): Promise<EvaluationResult[]>;
}
