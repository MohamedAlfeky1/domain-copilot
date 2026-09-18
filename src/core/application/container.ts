/**
 * DOMAIN COPILOT - DEPENDENCY INJECTION CONTAINER (DEV-001)
 * Assembles Clean Architecture layers (Domain -> Application -> Adapters)
 * Using gpt-4o as configured by user.
 */

import { dbAdapter } from "../../infrastructure/db/database.adapter";
import { resolveAIProvider, resolveEmbeddingProvider } from "../../infrastructure/ai/ai-provider.factory";
import { TesseractOcrAdapter } from "../../infrastructure/ocr/tesseract-ocr.adapter";
import { IAIProviderPort } from "./ports/ai-provider.port";
import { IOCRPort } from "./ports/ocr.port";
import { IngestionService } from "./ingestion/ingestion.service";
import { HybridRetrievalService } from "./retrieval/retrieval.service";
import { toolRegistry } from "./agents/tool-registry";
import { MultiAgentOrchestrator } from "./agents/orchestrator.service";
import { ApprovalService } from "./approvals/approval.service";
import { twistAdapter } from "../../infrastructure/twist/twist.adapter";

export interface AppContainer {
  db: typeof dbAdapter;
  vectorStore: typeof dbAdapter;
  aiProvider: IAIProviderPort;
  embeddingProvider: IAIProviderPort;
  ocrPort: IOCRPort;
  ingestionService: IngestionService;
  retrievalService: HybridRetrievalService;
  orchestratorService: MultiAgentOrchestrator;
  approvalService: ApprovalService;
  toolRegistry: typeof toolRegistry;
  twistAdapter: typeof twistAdapter;
}

export const buildContainer = (): AppContainer => {
  const currentAiProvider = resolveAIProvider();
  const currentEmbeddingProvider = resolveEmbeddingProvider();
  const ocrPort = new TesseractOcrAdapter();
  toolRegistry.setTwistPort(twistAdapter);
  const ingestionService = new IngestionService(dbAdapter, dbAdapter, currentEmbeddingProvider, ocrPort);
  const retrievalService = new HybridRetrievalService(dbAdapter, currentEmbeddingProvider, dbAdapter);
  const approvalService = new ApprovalService(dbAdapter);
  const orchestratorService = new MultiAgentOrchestrator(
    dbAdapter,
    currentAiProvider,
    retrievalService,
    toolRegistry,
    approvalService,
    twistAdapter
  );

  return {
    db: dbAdapter,
    vectorStore: dbAdapter,
    aiProvider: currentAiProvider,
    embeddingProvider: currentEmbeddingProvider,
    ocrPort,
    ingestionService,
    retrievalService,
    orchestratorService,
    approvalService,
    toolRegistry,
    twistAdapter,
  };
};

declare global {
  var __appContainerInstance: AppContainer | undefined;
}

export const container: AppContainer =
  globalThis.__appContainerInstance ?? buildContainer();

if (process.env.NODE_ENV !== "production") {
  globalThis.__appContainerInstance = container;
}


