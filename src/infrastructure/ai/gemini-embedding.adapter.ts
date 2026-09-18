/**
 * DOMAIN COPILOT - GEMINI EMBEDDING ADAPTER (Step 6)
 * Implements IAIProviderPort (IEmbeddingProviderPort) using Google Gemini Embedding API.
 *
 * Capabilities:
 * - Gemini Embedding 001 model support ('models/gemini-embedding-001' or 'gemini-embedding-001').
 * - Fixed 1536 output dimensions matching pgvector database schema.
 * - Explicit task types: RETRIEVAL_QUERY for search queries, RETRIEVAL_DOCUMENT for stored chunks.
 * - L2 vector normalization (unit Euclidean norm) for numerical precision with cosine distance.
 * - Strict vector dimension validation (rejects truncated/mismatched output).
 * - Comprehensive error mapping (400 auth, 429 quota, 503 unavailable, timeouts).
 * - Pluggable mock transport for 100% deterministic offline verification.
 */

import {
  IAIProviderPort,
  CompletionMessage,
  CompletionResult,
  ToolDefinition,
} from "../../core/application/ports/ai-provider.port";
import { ProviderFailureError } from "../../core/domain/errors";
import { ConfigurationError } from "./ai-provider.factory";

export interface GeminiEmbeddingConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  dimension?: number;
}

export type GeminiEmbeddingTransport = {
  embedContent?: (params: {
    model: string;
    content: { parts: Array<{ text: string }> };
    taskType?: string;
    outputDimensionality?: number;
  }) => Promise<any>;
  batchEmbedContents?: (params: {
    model: string;
    requests: Array<{
      model: string;
      content: { parts: Array<{ text: string }> };
      taskType?: string;
      outputDimensionality?: number;
    }>;
  }) => Promise<any>;
};

/**
 * Normalizes vector to unit Euclidean norm (L2 norm = 1.0).
 * Required for reduced-dimension Gemini embeddings before pgvector cosine distance operations.
 */
export function normalizeVector(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) {
    return vec;
  }
  const normalized = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    normalized[i] = vec[i] / norm;
  }
  return normalized;
}

export class GeminiEmbeddingAdapter implements IAIProviderPort {
  readonly providerName = "gemini";
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly requiredDimension: number = 1536;
  private customTransport?: GeminiEmbeddingTransport;

  constructor(config?: GeminiEmbeddingConfig, customTransport?: GeminiEmbeddingTransport) {
    this.apiKey = config?.apiKey || process.env.GEMINI_API_KEY;
    this.baseUrl = config?.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
    const rawModel = config?.model || process.env.GEMINI_EMBEDDING_MODEL || "models/gemini-embedding-001";
    this.defaultModel = this.normalizeModelName(rawModel);
    this.requiredDimension = config?.dimension || 1536;
    this.customTransport = customTransport;

    this.validateModel(this.defaultModel);
  }

  /**
   * Sets custom transport for mock / offline deterministic test execution.
   */
  setCustomTransport(transport: GeminiEmbeddingTransport | undefined): void {
    this.customTransport = transport;
  }

  getModelName(): string {
    return this.defaultModel;
  }

  getDimension(): number {
    return this.requiredDimension;
  }

  /**
   * Generates single embedding. Defaults taskType to 'RETRIEVAL_QUERY' for search queries.
   */
  async generateEmbedding(
    text: string,
    options?: { model?: string; taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" | string }
  ): Promise<{ embedding: number[]; dimension: number; model: string }> {
    const model = this.normalizeModelName(options?.model || this.defaultModel);
    this.validateModel(model);
    const taskType = options?.taskType || "RETRIEVAL_QUERY";

    // 1. Mock Transport Execution
    if (this.customTransport?.embedContent) {
      try {
        const raw = await this.customTransport.embedContent({
          model,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: this.requiredDimension,
        });
        return this.processSingleEmbeddingResponse(raw, model);
      } catch (err: any) {
        throw this.mapError(err, model);
      }
    }

    // 2. Production HTTP Execution
    if (!this.apiKey || this.apiKey.trim().length === 0 || this.apiKey.includes("your_gemini_api_key")) {
      throw new ConfigurationError("GEMINI_API_KEY is required in environment variables.");
    }

    try {
      const url = `${this.baseUrl}/${model}:embedContent?key=${encodeURIComponent(this.apiKey)}`;
      const payload = {
        model,
        content: { parts: [{ text: text.slice(0, 8000) }] },
        taskType,
        outputDimensionality: this.requiredDimension,
      };

      const raw = await this.postJsonWithRetry(url, payload);
      return this.processSingleEmbeddingResponse(raw, model);
    } catch (err: any) {
      throw this.mapError(err, model);
    }
  }

  /**
   * Generates batch embeddings. Defaults taskType to 'RETRIEVAL_DOCUMENT' for stored document chunks.
   */
  async generateBatchEmbeddings(
    texts: string[],
    options?: { model?: string; taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" | string }
  ): Promise<Array<{ embedding: number[]; dimension: number; model: string }>> {
    const model = this.normalizeModelName(options?.model || this.defaultModel);
    this.validateModel(model);
    const taskType = options?.taskType || "RETRIEVAL_DOCUMENT";

    if (texts.length === 0) {
      return [];
    }

    // 1. Mock Transport Execution
    if (this.customTransport?.batchEmbedContents) {
      try {
        const requests = texts.map((t) => ({
          model,
          content: { parts: [{ text: t }] },
          taskType,
          outputDimensionality: this.requiredDimension,
        }));
        const raw = await this.customTransport.batchEmbedContents({ model, requests });
        return this.processBatchEmbeddingResponse(raw, model, texts.length);
      } catch (err: any) {
        throw this.mapError(err, model);
      }
    }

    // 2. Production HTTP Execution
    if (!this.apiKey || this.apiKey.trim().length === 0 || this.apiKey.includes("your_gemini_api_key")) {
      throw new ConfigurationError("GEMINI_API_KEY is required in environment variables.");
    }

    try {
      const url = `${this.baseUrl}/${model}:batchEmbedContents?key=${encodeURIComponent(this.apiKey)}`;
      const requests = texts.map((t) => ({
        model,
        content: { parts: [{ text: t.slice(0, 8000) }] },
        taskType,
        outputDimensionality: this.requiredDimension,
      }));

      const raw = await this.postJsonWithRetry(url, { requests });
      return this.processBatchEmbeddingResponse(raw, model, texts.length);
    } catch (err: any) {
      throw this.mapError(err, model);
    }
  }

  /**
   * Chat completion is not supported on embedding-only adapter.
   */
  async generateCompletion(
    messages: CompletionMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number; tools?: ToolDefinition[] }
  ): Promise<CompletionResult> {
    throw new ProviderFailureError(
      "GeminiEmbeddingAdapter is an embedding-only provider and does not support chat completions. Configure AI_PROVIDER for completions.",
      this.providerName
    );
  }

  async streamCompletion(
    messages: CompletionMessage[],
    onToken: (token: string) => void,
    options?: { model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal }
  ): Promise<CompletionResult> {
    throw new ProviderFailureError(
      "GeminiEmbeddingAdapter is an embedding-only provider and does not support streaming chat completions. Configure AI_PROVIDER for completions.",
      this.providerName
    );
  }

  private processSingleEmbeddingResponse(
    raw: any,
    model: string
  ): { embedding: number[]; dimension: number; model: string } {
    const values = raw?.embedding?.values || raw?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new ProviderFailureError(
        `Gemini embedding response was malformed or missing vector values. (model: ${model})`,
        this.providerName
      );
    }

    if (values.length !== this.requiredDimension) {
      throw new ProviderFailureError(
        `Gemini returned vector with dimension ${values.length}, expected exactly ${this.requiredDimension}. (model: ${model})`,
        this.providerName
      );
    }

    const normalized = normalizeVector(values);
    return {
      embedding: normalized,
      dimension: this.requiredDimension,
      model,
    };
  }

  private processBatchEmbeddingResponse(
    raw: any,
    model: string,
    expectedCount: number
  ): Array<{ embedding: number[]; dimension: number; model: string }> {
    const embeddingsArray = raw?.embeddings;
    if (!Array.isArray(embeddingsArray) || embeddingsArray.length !== expectedCount) {
      throw new ProviderFailureError(
        `Gemini batch embedding response malformed: expected ${expectedCount} vectors, received ${embeddingsArray?.length ?? 0}. (model: ${model})`,
        this.providerName
      );
    }

    return embeddingsArray.map((item: any, idx: number) => {
      const values = item?.values;
      if (!Array.isArray(values) || values.length === 0) {
        throw new ProviderFailureError(
          `Gemini batch embedding vector at index ${idx} was empty or malformed. (model: ${model})`,
          this.providerName
        );
      }

      if (values.length !== this.requiredDimension) {
        throw new ProviderFailureError(
          `Gemini batch vector at index ${idx} returned dimension ${values.length}, expected exactly ${this.requiredDimension}. (model: ${model})`,
          this.providerName
        );
      }

      return {
        embedding: normalizeVector(values),
        dimension: this.requiredDimension,
        model,
      };
    });
  }

  private normalizeModelName(model: string): string {
    const trimmed = model.trim();
    if (!trimmed.startsWith("models/")) {
      return `models/${trimmed}`;
    }
    return trimmed;
  }

  private async postJsonWithRetry(url: string, payload: unknown): Promise<any> {
    const maxAttempts = 8;
    let lastError: any;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let is429 = false;
      let suggestedDelayMs = 0;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return await response.json();
        }

        const errBody = await response.json().catch(() => ({}));
        const message = errBody?.error?.message || response.statusText;
        const error = {
          status: response.status,
          message,
          body: errBody,
        };

        if (response.status === 429) {
          is429 = true;
          const retryInfo = errBody?.error?.details?.find((d: any) =>
            d["@type"]?.includes("RetryInfo")
          );
          if (retryInfo?.retryDelay) {
            const parsed = parseFloat(String(retryInfo.retryDelay).replace("s", ""));
            if (!isNaN(parsed) && parsed > 0) {
              suggestedDelayMs = Math.ceil(parsed * 1000);
            }
          }
          if (!suggestedDelayMs) {
            const match = message.match(/retry in\s+([\d.]+)\s*s/i);
            if (match && match[1]) {
              const parsed = parseFloat(match[1]);
              if (!isNaN(parsed) && parsed > 0) {
                suggestedDelayMs = Math.ceil(parsed * 1000);
              }
            }
          }
        } else if (response.status < 500) {
          throw error;
        }
        lastError = error;
      } catch (error: any) {
        if (error?.status && error.status !== 429 && error.status < 500) {
          throw error;
        }
        if (error?.status === 429) {
          is429 = true;
        }
        lastError = error;
      }

      if (attempt < maxAttempts - 1) {
        let waitMs = 1000 * 2 ** attempt;
        if (is429) {
          waitMs = Math.max(suggestedDelayMs ? suggestedDelayMs + 2000 : 8000, 10000 * Math.min(6, attempt + 1));
          console.warn(`[GeminiEmbeddingAdapter] 429 Rate limit / quota exceeded. Waiting ${(waitMs / 1000).toFixed(1)}s before retry ${attempt + 2}/${maxAttempts}...`);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
    }

    throw lastError;
  }

  private validateModel(model: string): void {
    const normalized = model.toLowerCase();
    // Allow Gemini embedding model identifiers.
    if (!normalized.includes("embed")) {
      throw new ConfigurationError(
        `Invalid Gemini embedding model: '${model}'. Model must be a designated embedding model such as 'models/gemini-embedding-001'.`
      );
    }
  }

  private mapError(error: any, model: string): Error {
    if (error instanceof ProviderFailureError || error instanceof ConfigurationError) {
      return error;
    }

    const status = error.status || error.statusCode;
    const message = error.message || "Unknown Gemini embedding error";

    if (
      status === 400 &&
      (/api key not valid|invalid api key|api_key_invalid/i.test(message) || /key/i.test(message))
    ) {
      return new ProviderFailureError(
        `Gemini authentication failed: Invalid or missing API key. (model: ${model})`,
        this.providerName
      );
    }

    if (status === 401 || /unauthorized|auth/i.test(message)) {
      return new ProviderFailureError(
        `Gemini authentication failed: Invalid API key. (model: ${model})`,
        this.providerName
      );
    }

    if (status === 429 || /rate limit|quota|resource_exhausted/i.test(message)) {
      return new ProviderFailureError(
        `Gemini embedding rate limit or quota exceeded. Please retry later. (model: ${model})`,
        this.providerName
      );
    }

    if (status === 502 || status === 503 || /unavailable|service unavailable/i.test(message)) {
      return new ProviderFailureError(
        `Gemini embedding service unavailable: ${message} (model: ${model})`,
        this.providerName
      );
    }

    if (/timeout|timed out|abort/i.test(message) || error.name === "AbortError") {
      return new ProviderFailureError(
        `Gemini embedding request timed out. (model: ${model})`,
        this.providerName
      );
    }

    return new ProviderFailureError(
      `Gemini embedding failed: ${message} (model: ${model})`,
      this.providerName
    );
  }
}
