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

export interface AppContainer {
  db: typeof dbAdapter;
  vectorStore: typeof dbAdapter;
  aiProvider: OpenAIProviderAdapter;
  ingestionService: IngestionService;
  retrievalService: HybridRetrievalService;
  orchestratorService: MultiAgentOrchestrator;
  approvalService: ApprovalService;
  toolRegistry: typeof toolRegistry;
  twistAdapter: typeof twistAdapter;
}

declare global {
  var __appContainerInstance: AppContainer | undefined;
}

const buildContainer = (): AppContainer => {
  toolRegistry.setTwistPort(twistAdapter);
  const ingestionService = new IngestionService(dbAdapter, dbAdapter, aiProvider);
  const retrievalService = new HybridRetrievalService(dbAdapter, aiProvider, dbAdapter);
  const approvalService = new ApprovalService(dbAdapter);
  const orchestratorService = new MultiAgentOrchestrator(
    dbAdapter,
    aiProvider,
    retrievalService,
    toolRegistry,
    approvalService,
    twistAdapter
  );

  return {
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
};

export const container: AppContainer =
  globalThis.__appContainerInstance ?? buildContainer();

if (process.env.NODE_ENV !== "production") {
  globalThis.__appContainerInstance = container;
}

