/**
 * DOMAIN COPILOT - AI & EMBEDDING PROVIDER FACTORY & RESOLVER (Step 4 & Step 6)
 * Selects and instantiates the active AI provider adapter (LLM) and Embedding provider adapter.
 * Decouples the application container from concrete AI and embedding vendor implementations.
 */

import dotenv from "dotenv";
import { IAIProviderPort } from "../../core/application/ports/ai-provider.port";
import { OpenAIProviderAdapter } from "./openai.adapter";
import { OpenRouterProviderAdapter } from "./openrouter.adapter";
import { GeminiEmbeddingAdapter } from "./gemini-embedding.adapter";

dotenv.config();

export class ConfigurationError extends Error {
  readonly code = "CONFIGURATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// -----------------------------------------------------------------------------
// 1. LLM / Chat Completion Provider Selection
// -----------------------------------------------------------------------------

export interface AIProviderConfig {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  embeddingModel?: string;
}

export type SupportedAIProvider = "openai" | "openrouter";
export const SUPPORTED_AI_PROVIDERS: readonly SupportedAIProvider[] = ["openai", "openrouter"] as const;

/**
 * Resolves and instantiates an AI provider (LLM completions, streaming, tool calling).
 * Controlled by AI_PROVIDER environment variable.
 */
export function resolveAIProvider(config?: AIProviderConfig): IAIProviderPort {
  const provider = (config?.provider ?? process.env.AI_PROVIDER ?? "").trim().toLowerCase();

  if (!provider) {
    throw new ConfigurationError(
      "Missing AI provider configuration. Please set AI_PROVIDER in environment variables (e.g. AI_PROVIDER=openai)."
    );
  }

  switch (provider) {
    case "openai": {
      const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY;
      const model = config?.model ?? process.env.AI_MODEL ?? "gpt-4o";
      const embeddingModel =
        config?.embeddingModel ?? process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
      return new OpenAIProviderAdapter(apiKey, model, embeddingModel);
    }
    case "openrouter": {
      const apiKey = config?.apiKey ?? process.env.OPENROUTER_API_KEY;
      if (!apiKey || apiKey.trim().length === 0 || apiKey.includes("your_openrouter_api_key")) {
        throw new ConfigurationError(
          "OPENROUTER_API_KEY is required in environment variables."
        );
      }
      const baseUrl = config?.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
      const model = config?.model ?? process.env.OPENROUTER_MODEL ?? process.env.AI_MODEL ?? "openai/gpt-4o";
      return new OpenRouterProviderAdapter({ apiKey, baseUrl, defaultModel: model });
    }
    default: {
      throw new ConfigurationError(
        `Unsupported AI provider: '${provider}'. Supported providers: ${SUPPORTED_AI_PROVIDERS.join(", ")}.`
      );
    }
  }
}

export const createAIProvider = resolveAIProvider;

// -----------------------------------------------------------------------------
// 2. Embedding Provider Selection (Step 6)
// -----------------------------------------------------------------------------

export interface EmbeddingProviderConfig {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  dimension?: number;
}

export type SupportedEmbeddingProvider = "openai" | "gemini";
export const SUPPORTED_EMBEDDING_PROVIDERS: readonly SupportedEmbeddingProvider[] = [
  "openai",
  "gemini",
] as const;

/**
 * Resolves and instantiates an Embedding provider (document/chunk embeddings, query embeddings).
 * Controlled independently by EMBEDDING_PROVIDER environment variable.
 */
export function resolveEmbeddingProvider(config?: EmbeddingProviderConfig): IAIProviderPort {
  const rawProvider = config?.provider ?? process.env.EMBEDDING_PROVIDER ?? "openai";
  const provider = rawProvider.trim().toLowerCase();

  if (!provider) {
    throw new ConfigurationError(
      "Missing embedding provider configuration. Please set EMBEDDING_PROVIDER in environment variables (e.g. EMBEDDING_PROVIDER=openai or EMBEDDING_PROVIDER=gemini)."
    );
  }

  switch (provider) {
    case "openai": {
      const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY;
      const model = config?.model ?? process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

      // Reject mixed vector space configuration: Gemini model on OpenAI provider
      if (model.toLowerCase().includes("gemini") || model.toLowerCase().includes("embedding-001")) {
        throw new ConfigurationError(
          `Invalid embedding model '${model}' for OpenAI provider. Did you mean to set EMBEDDING_PROVIDER=gemini?`
        );
      }

      return new OpenAIProviderAdapter(
        apiKey,
        process.env.AI_MODEL || "gpt-4o",
        model
      );
    }
    case "gemini": {
      const apiKey = config?.apiKey ?? process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim().length === 0 || apiKey.includes("your_gemini_api_key")) {
        throw new ConfigurationError(
          "GEMINI_API_KEY is required in environment variables."
        );
      }
      const model = config?.model ?? process.env.GEMINI_EMBEDDING_MODEL ?? "models/embedding-001";

      // Reject mixed vector space configuration: OpenAI model on Gemini provider
      if (model.toLowerCase().includes("text-embedding-3") || model.toLowerCase().includes("ada")) {
        throw new ConfigurationError(
          `Invalid embedding model '${model}' for Gemini provider. Did you mean to set EMBEDDING_PROVIDER=openai?`
        );
      }

      return new GeminiEmbeddingAdapter({
        apiKey,
        baseUrl: config?.baseUrl,
        model,
        dimension: config?.dimension || 1536,
      });
    }
    default: {
      throw new ConfigurationError(
        `Unsupported embedding provider: '${provider}'. Supported embedding providers: ${SUPPORTED_EMBEDDING_PROVIDERS.join(", ")}.`
      );
    }
  }
}

export const createEmbeddingProvider = resolveEmbeddingProvider;

/**
 * Validates that two embedding models belong to the same vector space family.
 * Refuses mixed vector space search/indexing operations.
 */
export function validateVectorSpaceConsistency(
  activeEmbeddingModel: string,
  targetCorpusModel: string
): void {
  const activeNormalized = activeEmbeddingModel.trim().toLowerCase();
  const targetNormalized = targetCorpusModel.trim().toLowerCase();

  const activeIsGemini = activeNormalized.includes("embedding-001") || activeNormalized.includes("gemini");
  const targetIsGemini = targetNormalized.includes("embedding-001") || targetNormalized.includes("gemini");

  const activeIsOpenAI = activeNormalized.includes("text-embedding") || activeNormalized.includes("openai");
  const targetIsOpenAI = targetNormalized.includes("text-embedding") || targetNormalized.includes("openai");

  if ((activeIsGemini && targetIsOpenAI) || (activeIsOpenAI && targetIsGemini)) {
    throw new ConfigurationError(
      `Mixed vector space detected: Target corpus is indexed with '${targetCorpusModel}', but active query model is '${activeEmbeddingModel}'. Querying across incompatible vector spaces is prohibited.`
    );
  }
}
