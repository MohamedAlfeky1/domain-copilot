/**
 * DOMAIN COPILOT - DEPENDENCY INJECTION CONTAINER (DEV-001)
 * Assembles Clean Architecture layers (Domain -> Application -> Adapters)
 * Using gpt-4o as configured by user.
 */

import { dbAdapter } from "../../infrastructure/db/database.adapter";
import { OpenAIProviderAdapter } from "../../infrastructure/ai/openai.adapter";
import { IngestionService } from "./ingestion/ingestion.service";
import { HybridRetrievalService } from "./retrieval/retrieval.service";
import { toolRegistry } from "./agents/tool-registry";
import { MultiAgentOrchestrator } from "./agents/orchestrator.service";
import { ApprovalService } from "./approvals/approval.service";
import { twistAdapter } from "../../infrastructure/twist/twist.adapter";

// 1. Infrastructure Providers
const aiProvider = new OpenAIProviderAdapter(
  process.env.OPENAI_API_KEY,
  process.env.AI_MODEL || "gpt-4o",
  process.env.EMBEDDING_MODEL || "text-embedding-3-small"
);

// 2. Application Services
const ingestionService = new IngestionService(dbAdapter, dbAdapter, aiProvider);
const retrievalService = new HybridRetrievalService(dbAdapter, aiProvider, dbAdapter);
const orchestratorService = new MultiAgentOrchestrator(dbAdapter, aiProvider, retrievalService, toolRegistry);
const approvalService = new ApprovalService(dbAdapter);

export const container = {
  db: dbAdapter,
  vectorStore: dbAdapter,
  aiProvider,
  ingestionService,
  retrievalService,
  orchestratorService,
  approvalService,
  toolRegistry,
  twistAdapter,
};
