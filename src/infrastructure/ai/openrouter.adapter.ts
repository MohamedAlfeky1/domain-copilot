/**
 * DOMAIN COPILOT - OPENROUTER AI PROVIDER ADAPTER (Step 5)
 * Implements IAIProviderPort for OpenRouter API using OpenAI-compatible interface.
 *
 * Capabilities:
 * - Full chat completion with tool calling and structured output.
 * - Real-time token streaming with abort signal support.
 * - Explicit model validation (prohibits arbitrary auto-routing for clinical workflows).
 * - Comprehensive error mapping (auth, rate limits, timeouts, model availability).
 * - Embedding continuity: preserves existing 1536d embeddings for pgvector compatibility.
 * - Safe mock transport support for 100% deterministic offline testing.
 */

import OpenAI from "openai";
import {
  IAIProviderPort,
  CompletionMessage,
  CompletionResult,
  ToolDefinition,
  ToolCallRequest,
} from "../../core/application/ports/ai-provider.port";
import { ProviderFailureError } from "../../core/domain/errors";
import { ConfigurationError } from "./ai-provider.factory";
import { OpenAIProviderAdapter } from "./openai.adapter";

export interface OpenRouterConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  siteUrl?: string;
  siteName?: string;
}

export type OpenRouterTransport = {
  chatCompletion?: (params: {
    model: string;
    messages: any[];
    temperature?: number;
    max_tokens?: number;
    tools?: any[];
  }) => Promise<any>;
  streamCompletion?: (
    params: {
      model: string;
      messages: any[];
      temperature?: number;
      max_tokens?: number;
      signal?: AbortSignal;
    },
    onToken: (token: string) => void
  ) => Promise<any>;
};

export class OpenRouterProviderAdapter implements IAIProviderPort {
  readonly providerName = "openrouter";
  private client: OpenAI | null = null;
  private readonly defaultModel: string;
  private readonly embeddingDelegate: IAIProviderPort;
  private customTransport?: OpenRouterTransport;

  constructor(
    config?: OpenRouterConfig,
    embeddingDelegate?: IAIProviderPort,
    customTransport?: OpenRouterTransport
  ) {
    const key = config?.apiKey || process.env.OPENROUTER_API_KEY;
    const baseUrl = config?.baseUrl || process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    this.defaultModel = config?.defaultModel || process.env.OPENROUTER_MODEL || process.env.AI_MODEL || "openai/gpt-4o";
    this.customTransport = customTransport;

    this.validateModel(this.defaultModel);

    // Embeddings preservation: delegate to existing 1536d provider so pgvector/retrieval are untouched
    this.embeddingDelegate =
      embeddingDelegate ||
      new OpenAIProviderAdapter(
        process.env.OPENAI_API_KEY,
        process.env.AI_MODEL || "gpt-4o",
        process.env.EMBEDDING_MODEL || "text-embedding-3-small"
      );

    if (key && key.trim().length > 0 && !key.includes("your_openrouter_api_key")) {
      this.client = new OpenAI({
        apiKey: key,
        baseURL: baseUrl,
        defaultHeaders: {
          "HTTP-Referer": config?.siteUrl || "http://localhost:3000",
          "X-Title": config?.siteName || "Domain Copilot",
        },
      });
    }
  }

  /**
   * Returns the configured default model name.
   */
  getModelName(): string {
    return this.defaultModel;
  }

  /**
   * Sets custom transport for mock / offline deterministic test execution.
   */
  setCustomTransport(transport: OpenRouterTransport | undefined): void {
    this.customTransport = transport;
  }

  /**
   * Executes normal chat completion with tool calling and structured output.
   */
  async generateCompletion(
    messages: CompletionMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: ToolDefinition[];
    }
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    this.validateModel(model);

    const formattedMessages = messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant" | "tool",
      content: m.content,
      name: m.name,
      tool_call_id: m.toolCallId,
    }));

    const toolsParam = options?.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    if (this.customTransport?.chatCompletion) {
      try {
        const raw = await this.customTransport.chatCompletion({
          model,
          messages: formattedMessages,
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          tools: toolsParam,
        });

        const choice = raw?.choices?.[0];
        const message = choice?.message;
        const toolCalls: ToolCallRequest[] | undefined =
          raw.toolCalls ||
          message?.tool_calls?.map((tc: any) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments),
          }));

        const promptTokens = raw?.usage?.prompt_tokens ?? raw?.promptTokens ?? 0;
        const completionTokens = raw?.usage?.completion_tokens ?? raw?.completionTokens ?? 0;
        const totalTokens = raw?.usage?.total_tokens ?? raw?.totalTokens ?? (promptTokens + completionTokens);

        return {
          text: message?.content ?? raw?.text ?? raw?.content ?? "",
          toolCalls,
          promptTokens,
          completionTokens,
          totalTokens,
          model,
          provider: this.providerName,
        };
      } catch (err: any) {
        throw this.mapError(err, model);
      }
    }

    if (!this.client) {
      throw new ProviderFailureError(
        "OpenRouter client is not initialized. Please verify OPENROUTER_API_KEY is configured.",
        this.providerName
      );
    }

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: formattedMessages as any,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 1500,
        tools: toolsParam && toolsParam.length > 0 ? toolsParam : undefined,
      });

      const choice = response.choices[0];
      if (!choice || !choice.message) {
        throw new ProviderFailureError(
          `OpenRouter returned empty choices array (model: ${model})`,
          this.providerName
        );
      }

      const message = choice.message;
      const toolCalls: ToolCallRequest[] | undefined = message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));

      const promptTokens = response.usage?.prompt_tokens ?? 0;
      const completionTokens = response.usage?.completion_tokens ?? 0;
      const totalTokens = response.usage?.total_tokens ?? (promptTokens + completionTokens);

      return {
        text: message.content || "",
        toolCalls,
        promptTokens,
        completionTokens,
        totalTokens,
        model,
        provider: this.providerName,
      };
    } catch (error: any) {
      throw this.mapError(error, model);
    }
  }

  /**
   * Executes streaming chat completion with live token events.
   */
  async streamCompletion(
    messages: CompletionMessage[],
    onToken: (token: string) => void,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
    }
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    this.validateModel(model);

    const formattedMessages = messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant" | "tool",
      content: m.content,
      name: m.name,
      tool_call_id: m.toolCallId,
    }));

    if (this.customTransport?.streamCompletion) {
      try {
        const raw = await this.customTransport.streamCompletion(
          {
            model,
            messages: formattedMessages,
            temperature: options?.temperature,
            max_tokens: options?.maxTokens,
            signal: options?.signal,
          },
          onToken
        );

        const promptTokens = raw?.usage?.prompt_tokens ?? raw?.promptTokens ?? 0;
        const completionTokens = raw?.usage?.completion_tokens ?? raw?.completionTokens ?? 0;
        const totalTokens = raw?.usage?.total_tokens ?? raw?.totalTokens ?? (promptTokens + completionTokens);

        return {
          text: raw?.text ?? raw?.content ?? "",
          promptTokens,
          completionTokens,
          totalTokens,
          model,
          provider: this.providerName,
        };
      } catch (err: any) {
        throw this.mapError(err, model);
      }
    }

    if (!this.client) {
      throw new ProviderFailureError(
        "OpenRouter client is not initialized. Please verify OPENROUTER_API_KEY is configured.",
        this.providerName
      );
    }

    try {
      const stream = await this.client.chat.completions.create(
        {
          model,
          messages: formattedMessages as any,
          temperature: options?.temperature ?? 0.2,
          max_tokens: options?.maxTokens ?? 1500,
          stream: true,
        },
        { signal: options?.signal }
      );

      let fullText = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullText += delta;
          onToken(delta);
        }
      }

      const promptTokens = Math.ceil(messages.map((m) => m.content).join(" ").length / 4);
      const completionTokens = Math.ceil(fullText.length / 4);

      return {
        text: fullText,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        model,
        provider: this.providerName,
      };
    } catch (error: any) {
      throw this.mapError(error, model);
    }
  }

  /**
   * Embeddings continuity: preserved 1536d embeddings for pgvector compatibility.
   */
  async generateEmbedding(
    text: string,
    options?: { model?: string }
  ): Promise<{ embedding: number[]; dimension: number; model: string }> {
    return this.embeddingDelegate.generateEmbedding(text, options);
  }

  async generateBatchEmbeddings(
    texts: string[],
    options?: { model?: string }
  ): Promise<Array<{ embedding: number[]; dimension: number; model: string }>> {
    return this.embeddingDelegate.generateBatchEmbeddings(texts, options);
  }

  /**
   * Validates configured OpenRouter model.
   * Prohibits arbitrary auto-routing ('openrouter/auto') for clinical safety.
   */
  private validateModel(model: string): void {
    if (!model || model.trim().length === 0) {
      throw new ConfigurationError("OpenRouter model cannot be empty.");
    }

    const normalized = model.trim().toLowerCase();

    // Reject arbitrary auto-routing for clinical workflows
    if (normalized === "openrouter/auto" || normalized.startsWith("openrouter/auto:")) {
      throw new ConfigurationError(
        `Arbitrary automatic model routing ('${model}') is prohibited for clinical/healthcare workflows. Please configure an explicit model ID (e.g. 'openai/gpt-4o' or 'anthropic/claude-3.5-sonnet').`
      );
    }

    // Models known to lack tool-calling capabilities or reasoning-only models incompatible with tools
    const INCOMPATIBLE_MODELS = [
      "openai/text-davinci-003",
      "openai/text-curie-001",
      "openai/o1-preview",
      "google/gemini-embedding",
      "mistralai/mistral-embed",
    ];

    if (INCOMPATIBLE_MODELS.some((m) => normalized === m || (normalized.includes("embed") && !normalized.includes("chat")))) {
      throw new ConfigurationError(
        `Model '${model}' does not support required capabilities (tool calling and structured output) or is incompatible.`
      );
    }
  }

  /**
   * Maps OpenRouter and network errors into standard ProviderFailureError.
   */
  private mapError(error: any, model: string): Error {
    if (error instanceof ProviderFailureError || error instanceof ConfigurationError) {
      return error;
    }

    const status = error.status || error.statusCode || error.response?.status;
    const message = error.message || "Unknown OpenRouter error";

    if (status === 401 || /unauthorized|invalid api key|auth/i.test(message)) {
      return new ProviderFailureError(
        `OpenRouter authentication failed: Invalid or missing API key. (model: ${model})`,
        this.providerName
      );
    }

    if (status === 429 || /rate limit|quota|too many requests/i.test(message)) {
      return new ProviderFailureError(
        `OpenRouter rate limit exceeded. Please retry later. (model: ${model})`,
        this.providerName
      );
    }

    if (
      status === 404 ||
      status === 502 ||
      status === 503 ||
      /unavailable|not found|no endpoints|service unavailable/i.test(message)
    ) {
      return new ProviderFailureError(
        `OpenRouter model or provider unavailable: ${message} (model: ${model})`,
        this.providerName
      );
    }

    if (/abort|cancel/i.test(message) || error.name === "AbortError") {
      return new ProviderFailureError(
        `OpenRouter request was aborted or cancelled. (model: ${model})`,
        this.providerName
      );
    }

    if (/timeout|timed out/i.test(message)) {
      return new ProviderFailureError(
        `OpenRouter request timed out. (model: ${model})`,
        this.providerName
      );
    }

    if (/tool|function call/i.test(message)) {
      return new ProviderFailureError(
        `OpenRouter model incompatible with tool calling: ${message} (model: ${model})`,
        this.providerName
      );
    }

    return new ProviderFailureError(
      `OpenRouter completion failed: ${message} (model: ${model})`,
      this.providerName
    );
  }
}
