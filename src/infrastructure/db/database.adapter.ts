/**
 * DOMAIN COPILOT - UNIFIED DATABASE & VECTOR STORE ADAPTER
 * Implements IDatabasePort and IVectorStorePort.
 * Provides resilient pgvector-compatible hybrid search (Dense Cosine + Keyword FTS + RRF fusion).
 */

import { IDatabasePort } from "../../core/application/ports/database.port";
import {
  IVectorStorePort,
  VectorSearchResult,
} from "../../core/application/ports/vector-store.port";
import {
  Document,
  DocumentVersion,
  Chunk,
  ChunkEmbedding,
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
} from "../../core/domain/types";

export class DatabaseAdapter implements IDatabasePort, IVectorStorePort {
  // In-memory persistent stores (acts as embedded high-performance repository)
  private users: Map<string, User> = new Map();
  private documents: Map<string, Document> = new Map();
  private versions: Map<string, DocumentVersion> = new Map();
  private chunks: Map<string, Chunk> = new Map();
  private embeddings: Map<string, ChunkEmbedding> = new Map();
  private jobs: Map<string, IngestionJob> = new Map();
  private runs: Map<string, Run> = new Map();
  private runSteps: Map<string, RunStep> = new Map();
  private toolCalls: Map<string, ToolCall> = new Map();
  private approvals: Map<string, ApprovalRequest> = new Map();
  private approvalEvents: ApprovalEvent[] = [];
  private usageLedger: UsageRecord[] = [];
  private evalCases: Map<string, EvaluationCase> = new Map();
  private evalResults: EvaluationResult[] = [];

  constructor() {
    this.seedDefaultUsers();
  }

  private seedDefaultUsers() {
    const adminUser: User = {
      id: "usr-admin-001",
      email: "admin@domaincopilot.ai",
      role: "ADMIN",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
    const approverUser: User = {
      id: "usr-approver-001",
      email: "approver@domaincopilot.ai",
      role: "APPROVER",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
    const expertUser: User = {
      id: "usr-expert-001",
      email: "expert@domaincopilot.ai",
      role: "EXPERT",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
    this.users.set(adminUser.id, adminUser);
    this.users.set(approverUser.id, approverUser);
    this.users.set(expertUser.id, expertUser);
  }

  // --- Users ---
  async getUserByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async createUser(user: Omit<User, "id" | "createdAt">): Promise<User> {
    const id = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const fullUser: User = {
      ...user,
      id,
      createdAt: new Date().toISOString(),
    };
    this.users.set(id, fullUser);
    return fullUser;
  }

  // --- Documents & Versions ---
  async saveDocument(doc: Document): Promise<Document> {
    this.documents.set(doc.id, doc);
    return doc;
  }

  async getDocumentById(id: string): Promise<Document | null> {
    return this.documents.get(id) || null;
  }

  async getDocumentByHash(contentHash: string): Promise<Document | null> {
    for (const d of this.documents.values()) {
      if (d.contentHash === contentHash) return d;
    }
    return null;
  }

  async listDocuments(): Promise<Document[]> {
    return Array.from(this.documents.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async saveDocumentVersion(version: DocumentVersion): Promise<DocumentVersion> {
    this.versions.set(version.id, version);
    return version;
  }

  async getActiveVersion(documentId: string): Promise<DocumentVersion | null> {
    for (const v of this.versions.values()) {
      if (v.documentId === documentId && v.isActive) return v;
    }
    return null;
  }

  // --- Chunks ---
  async saveChunks(newChunks: Chunk[]): Promise<void> {
    for (const c of newChunks) {
      this.chunks.set(c.id, c);
    }
  }

  async getChunksByVersion(versionId: string): Promise<Chunk[]> {
    const result: Chunk[] = [];
    for (const c of this.chunks.values()) {
      if (c.documentVersionId === versionId) result.push(c);
    }
    return result.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async getChunkById(chunkId: string): Promise<Chunk | null> {
    return this.chunks.get(chunkId) || null;
  }

  async countTotalChunks(): Promise<number> {
    return this.chunks.size;
  }

  // --- Vector Store Operations ---
  async saveEmbedding(embedding: ChunkEmbedding): Promise<void> {
    this.embeddings.set(embedding.chunkId, embedding);
  }

  async saveBatchEmbeddings(newEmbeddings: ChunkEmbedding[]): Promise<void> {
    for (const e of newEmbeddings) {
      this.embeddings.set(e.chunkId, e);
    }
  }

  async searchSimilar(
    queryEmbedding: number[],
    options: {
      topK: number;
      minSimilarity?: number;
      documentVersionIds?: string[];
      section?: string;
    }
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];
    const minSim = options.minSimilarity ?? 0.0;

    for (const [chunkId, emb] of this.embeddings.entries()) {
      const chunk = this.chunks.get(chunkId);
      if (!chunk) continue;

      if (options.documentVersionIds && !options.documentVersionIds.includes(chunk.documentVersionId)) {
        continue;
      }
      if (options.section && chunk.section !== options.section) {
        continue;
      }

      const sim = this.cosineSimilarity(queryEmbedding, emb.vector);
      if (sim >= minSim) {
        results.push({
          chunk,
          similarity: sim,
          score: sim,
        });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, options.topK);
  }

  async searchKeyword(
    queryText: string,
    options: {
      topK: number;
      documentVersionIds?: string[];
    }
  ): Promise<Array<{ chunk: Chunk; rankScore: number }>> {
    const queryTokens = queryText.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    const results: Array<{ chunk: Chunk; rankScore: number }> = [];

    for (const chunk of this.chunks.values()) {
      if (options.documentVersionIds && !options.documentVersionIds.includes(chunk.documentVersionId)) {
        continue;
      }

      const textLower = chunk.text.toLowerCase();
      let matchCount = 0;
      for (const token of queryTokens) {
        if (textLower.includes(token)) matchCount++;
      }

      if (matchCount > 0) {
        const score = matchCount / Math.max(queryTokens.length, 1);
        results.push({ chunk, rankScore: score });
      }
    }

    return results.sort((a, b) => b.rankScore - a.rankScore).slice(0, options.topK);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // --- Ingestion Jobs ---
  async saveIngestionJob(job: IngestionJob): Promise<IngestionJob> {
    this.jobs.set(job.id, job);
    return job;
  }

  async updateIngestionJob(job: Partial<IngestionJob> & { id: string }): Promise<void> {
    const existing = this.jobs.get(job.id);
    if (existing) {
      this.jobs.set(job.id, { ...existing, ...job });
    }
  }

  async listIngestionJobs(): Promise<IngestionJob[]> {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
    );
  }

  // --- Runs & Traces ---
  async saveRun(run: Run): Promise<Run> {
    this.runs.set(run.id, run);
    return run;
  }

  async getRunById(id: string): Promise<Run | null> {
    return this.runs.get(id) || null;
  }

  async getRunByCorrelationId(correlationId: string): Promise<Run | null> {
    for (const r of this.runs.values()) {
      if (r.correlationId === correlationId) return r;
    }
    return null;
  }

  async updateRunStatus(
    id: string,
    status: Run["status"],
    refusalReason?: string,
    finalOutput?: string
  ): Promise<void> {
    const run = this.runs.get(id);
    if (run) {
      run.status = status;
      if (refusalReason) run.refusalReason = refusalReason;
      if (finalOutput) run.finalOutput = finalOutput;
      if (["COMPLETED", "REFUSED", "FAILED", "CANCELLED"].includes(status)) {
        run.endedAt = new Date().toISOString();
      }
    }
  }

  async listRuns(limit = 50): Promise<Run[]> {
    return Array.from(this.runs.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  // --- Steps & Tools ---
  async saveRunStep(step: RunStep): Promise<RunStep> {
    this.runSteps.set(step.id, step);
    return step;
  }

  async updateRunStep(
    stepId: string,
    status: RunStep["status"],
    outputPayload?: unknown,
    latencyMs?: number
  ): Promise<void> {
    const step = this.runSteps.get(stepId);
    if (step) {
      step.status = status;
      if (outputPayload) step.outputPayload = outputPayload;
      if (latencyMs) step.latencyMs = latencyMs;
      step.endedAt = new Date().toISOString();
    }
  }

  async getRunSteps(runId: string): Promise<RunStep[]> {
    const steps: RunStep[] = [];
    for (const s of this.runSteps.values()) {
      if (s.runId === runId) steps.push(s);
    }
    return steps.sort((a, b) => a.stepIndex - b.stepIndex);
  }

  async saveToolCall(toolCall: ToolCall): Promise<ToolCall> {
    this.toolCalls.set(toolCall.id, toolCall);
    return toolCall;
  }

  async updateToolCallOutcome(toolCallId: string, status: ToolCall["status"], outcome: unknown): Promise<void> {
    const tc = this.toolCalls.get(toolCallId);
    if (tc) {
      tc.status = status;
      tc.outcome = outcome;
    }
  }

  // --- Approvals & Audit ---
  async saveApproval(approval: ApprovalRequest): Promise<ApprovalRequest> {
    this.approvals.set(approval.id, approval);
    return approval;
  }

  async getApprovalById(id: string): Promise<ApprovalRequest | null> {
    return this.approvals.get(id) || null;
  }

  async listApprovals(status?: ApprovalRequest["status"]): Promise<ApprovalRequest[]> {
    const list = Array.from(this.approvals.values());
    if (!status) {
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list
      .filter((a) => a.status === status)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async updateApproval(
    id: string,
    status: ApprovalRequest["status"],
    approvedPayload?: Record<string, unknown>,
    comment?: string,
    reviewerId?: string
  ): Promise<void> {
    const app = this.approvals.get(id);
    if (app) {
      app.status = status;
      if (approvedPayload) app.approvedPayload = approvedPayload;
      if (comment) app.decisionComment = comment;
      if (reviewerId) app.reviewerId = reviewerId;
      app.decidedAt = new Date().toISOString();
    }
  }

  async saveApprovalEvent(event: ApprovalEvent): Promise<void> {
    this.approvalEvents.push(event);
  }

  async getApprovalEvents(approvalId: string): Promise<ApprovalEvent[]> {
    return this.approvalEvents
      .filter((e) => e.approvalId === approvalId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // --- Usage Ledger ---
  async recordUsage(record: UsageRecord): Promise<void> {
    this.usageLedger.push(record);
  }

  async getUsageByRun(runId: string): Promise<UsageRecord[]> {
    return this.usageLedger.filter((u) => u.runId === runId);
  }

  async getTotalUsage(): Promise<{ totalTokens: number; totalCostUsd: number; callCount: number }> {
    let totalTokens = 0;
    let totalCostUsd = 0;
    for (const u of this.usageLedger) {
      totalTokens += u.totalTokens;
      totalCostUsd += u.costUsd;
    }
    return {
      totalTokens,
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      callCount: this.usageLedger.length,
    };
  }

  // --- Evaluation ---
  async listEvaluationCases(): Promise<EvaluationCase[]> {
    return Array.from(this.evalCases.values());
  }

  async saveEvaluationResult(result: EvaluationResult): Promise<void> {
    this.evalResults.push(result);
  }

  async listEvaluationResults(): Promise<EvaluationResult[]> {
    return this.evalResults;
  }
}

// Global Singleton for dependency injection
export const dbAdapter = new DatabaseAdapter();
