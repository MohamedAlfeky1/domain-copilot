/**
 * DOMAIN COPILOT - CORE DOMAIN TYPES & INTERFACES
 * Pure domain definitions with zero framework or external SDK dependencies.
 */

export type UserRole = "ADMIN" | "APPROVER" | "EXPERT" | "VIEWER";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export type IngestionStage = "EXTRACT" | "CLEAN" | "CHUNK" | "EMBED" | "INDEX";
export type IngestionStatus = "QUEUED" | "RUNNING" | "PROCESSING" | "COMPLETED" | "INDEXED" | "FAILED";

export interface Document {
  id: string;
  source: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  currentVersionId?: string;
  status: IngestionStatus;
  ownerId?: string;
  createdAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  contentHash: string;
  language: string;
  pages: number;
  isActive: boolean;
  createdAt: string;
  extractionMethod?: "normal" | "ocr";
}

export interface ChunkMetadata {
  documentName?: string;
  source?: string;
  sourceHash?: string;
  section?: string;
  page?: number;
  clause?: string;
  headings?: string[];
  extractionMethod?: "normal" | "ocr";
  [key: string]: unknown;
}

export interface Chunk {
  id: string;
  documentVersionId: string;
  chunkIndex: number;
  section?: string;
  page?: number;
  clause?: string;
  text: string;
  tokenCount: number;
  metadata: ChunkMetadata;
  createdAt: string;
}

export interface ChunkEmbedding {
  id: string;
  chunkId: string;
  model: string;
  dimension: number;
  vector: number[];
  createdAt: string;
}

export interface IngestionJob {
  id: string;
  documentVersionId: string;
  stage: IngestionStage;
  status: IngestionStatus;
  progressPct: number;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  startedAt?: string;
  completedAt?: string;
}

export type RunStatus =
  | "STARTED"
  | "STREAMING"
  | "APPROVAL_PENDING"
  | "COMPLETED"
  | "REFUSED"
  | "FAILED"
  | "CANCELLED";

export interface Citation {
  citationId: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  version: number;
  page?: number;
  clause?: string;
  excerpt: string;
  score?: number;
  channel?: "dense" | "keyword" | "fused";
}

export interface Run {
  id: string;
  ownerId: string;
  sessionId: string;
  correlationId: string;
  query: string;
  status: RunStatus;
  filters?: Record<string, any>;
  refusalReason?: string;
  finalOutput?: string;
  citations: Citation[];
  startedAt: string;
  endedAt?: string;
}

export type StepType = "RETRIEVAL" | "AGENT_EXECUTION" | "TOOL_CALL" | "APPROVAL_GATE" | "GUARDRAIL";

export interface RunStep {
  id: string;
  runId: string;
  stepIndex: number;
  stepType: StepType;
  agent?: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
  inputPayload?: unknown;
  outputPayload?: unknown;
  latencyMs?: number;
  startedAt: string;
  endedAt?: string;
}

export interface ToolCall {
  id: string;
  runStepId: string;
  toolName: string;
  argsPayload: Record<string, unknown>;
  argsHash: string;
  isSideEffecting: boolean;
  approvalId?: string;
  outcome?: unknown;
  status: "PENDING" | "EXECUTED" | "BLOCKED" | "FAILED";
  createdAt: string;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ApprovalStatus = "PENDING" | "APPROVED" | "EDIT_APPROVED" | "REJECTED";

export interface ApprovalRequest {
  id: string;
  runId: string;
  toolCallId?: string;
  proposedAction: string;
  riskLevel: RiskLevel;
  requesterAgent: string;
  reviewerId?: string;
  originalPayload: Record<string, unknown>;
  originalHash: string;
  approvedPayload?: Record<string, unknown>;
  approvedHash?: string;
  status: ApprovalStatus;
  decisionComment?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface ApprovalEvent {
  id: string;
  approvalId: string;
  actorId?: string;
  action: "CREATED" | "APPROVED" | "EDITED_AND_APPROVED" | "REJECTED";
  previousState?: ApprovalStatus;
  newState: ApprovalStatus;
  payloadHash: string;
  reason?: string;
  timestamp: string;
}

export interface UsageRecord {
  id: string;
  runId: string;
  correlationId: string;
  provider: string;
  model: string;
  callType: "COMPLETION" | "EMBEDDING" | "STREAM";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  createdAt: string;
}

export interface EvaluationCase {
  id: string;
  question: string;
  expectedAnswer: string;
  expectedChunks: string[];
  category: "GROUNDED" | "ADVERSARIAL" | "OUT_OF_CORPUS" | "INJECTION" | "TWIST";
  isAdversarial: boolean;
}

export interface EvaluationResult {
  id: string;
  caseId: string;
  runId?: string;
  retrievalHit: boolean;
  groundednessScore: number;
  refusalCorrect: boolean;
  pass: boolean;
  latencyMs: number;
  totalCost: number;
  notes?: string;
  executedAt: string;
}
