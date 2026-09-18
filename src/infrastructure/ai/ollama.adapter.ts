/**
 * DOMAIN COPILOT - OLLAMA LOCAL AI PROVIDER ADAPTER
 * Implements IAIProviderPort for local Ollama HTTP API (e.g. qwen3:8b).
 *
 * Capabilities:
 * - Local LLM completions with native tool calling support.
 * - Progressive token streaming with AbortSignal cancellation.
 * - Zero cloud token cost ($0.00000) for local offline inference.
 * - Vector space continuity: preserves 1536d embeddings for pgvector compatibility.
 * - Comprehensive error mapping (offline, model not found, timeouts, cancellation).
 * - Pluggable mock transport for 100% deterministic offline verification.
 */

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

export interface OllamaConfig {
  baseUrl?: string;
  defaultModel?: string;
  think?: boolean;
}

export type OllamaTransport = {
  chat?: (params: {
    model: string;
    messages: any[];
    options?: { temperature?: number; num_predict?: number };
    tools?: any[];
    stream?: boolean;
    think?: boolean;
  }) => Promise<any>;
  stream?: (
    params: {
      model: string;
      messages: any[];
      options?: { temperature?: number; num_predict?: number };
      stream?: boolean;
      think?: boolean;
      signal?: AbortSignal;
    },
    onToken: (token: string) => void
  ) => Promise<any>;
};

export class OllamaProviderAdapter implements IAIProviderPort {
  readonly providerName = "ollama";
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly think: boolean;
  private readonly embeddingDelegate: IAIProviderPort;
  private customTransport?: OllamaTransport;

  constructor(
    config?: OllamaConfig,
    embeddingDelegate?: IAIProviderPort,
    customTransport?: OllamaTransport
  ) {
    const rawUrl = config?.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.baseUrl = rawUrl.replace(/\/+$/, "");
    this.defaultModel = config?.defaultModel || process.env.OLLAMA_MODEL || "qwen3:8b";
    this.customTransport = customTransport;

    if (config?.think !== undefined) {
      this.think = config.think;
    } else if (process.env.OLLAMA_THINK !== undefined) {
      this.think = process.env.OLLAMA_THINK === "true";
    } else {
      this.think = false; // Safe default for local qwen3:8b to avoid step timeout
    }

    this.validateModel(this.defaultModel);

    // Embeddings preservation: delegate to existing 1536d provider so pgvector/retrieval are untouched
    this.embeddingDelegate =
      embeddingDelegate ||
      new OpenAIProviderAdapter(
        process.env.OPENAI_API_KEY,
        process.env.AI_MODEL || "gpt-4o",
        process.env.EMBEDDING_MODEL || "text-embedding-3-small"
      );
  }

  /**
   * Returns configured default model name.
   */
  getModelName(): string {
    return this.defaultModel;
  }

  /**
   * Returns the base URL for Ollama HTTP API.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Returns configured thinking mode (defaults to false for fast local inference).
   */
  getThink(): boolean {
    return this.think;
  }

  /**
   * Sets custom transport for mock / offline deterministic test execution.
   */
  setCustomTransport(transport: OllamaTransport | undefined): void {
    this.customTransport = transport;
  }

  /**
   * Local inference has zero cloud provider cost.
   */
  calculateCost(_promptTokens: number, _completionTokens: number): number {
    return 0;
  }

  /**
   * Executes normal chat completion with tool calling support.
   */
  async generateCompletion(
    messages: CompletionMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: ToolDefinition[];
      think?: boolean;
    }
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    this.validateModel(model);
    const think = options?.think !== undefined ? options.think : this.think;

    const formattedMessages = messages.map((m) => {
      const msg: Record<string, any> = {
        role: m.role,
        content: m.content || "",
      };
      if (m.name) {
        msg.name = m.name;
      }
      if (m.role === "tool" && m.toolCallId) {
        msg.tool_call_id = m.toolCallId;
      }
      return msg;
    });

    const toolsParam =
      options?.tools && options.tools.length > 0
        ? options.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }))
        : undefined;

    if (this.customTransport?.chat) {
      try {
        const raw = await this.customTransport.chat({
          model,
          messages: formattedMessages,
          options: {
            temperature: options?.temperature,
            num_predict: options?.maxTokens,
          },
          tools: toolsParam,
          stream: false,
          think,
        });

        return this.parseChatResponse(raw, model, messages);
      } catch (err: any) {
        throw this.mapError(err, model);
      }
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: formattedMessages,
          stream: false,
          think,
          options: {
            temperature: options?.temperature ?? 0.1,
            num_predict: options?.maxTokens ?? 1500,
          },
          tools: toolsParam,
        }),
      });

      if (!res.ok) {
        let errorBody = "";
        try {
          errorBody = await res.text();
        } catch {
          // ignore
        }
        const err = new Error(errorBody || `HTTP ${res.status} ${res.statusText}`);
        (err as any).status = res.status;
        throw err;
      }

      let data: any;
      try {
        data = await res.json();
      } catch (parseErr: any) {
        throw new ProviderFailureError(
          `Ollama returned malformed JSON response: ${parseErr.message} (model: ${model})`,
          this.providerName
        );
      }

      return this.parseChatResponse(data, model, messages);
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
      think?: boolean;
    }
  ): Promise<CompletionResult> {
    const model = options?.model || this.defaultModel;
    this.validateModel(model);
    const think = options?.think !== undefined ? options.think : this.think;

    const formattedMessages = messages.map((m) => {
      const msg: Record<string, any> = {
        role: m.role,
        content: m.content || "",
      };
      if (m.name) {
        msg.name = m.name;
      }
      if (m.role === "tool" && m.toolCallId) {
        msg.tool_call_id = m.toolCallId;
      }
      return msg;
    });

    if (this.customTransport?.stream) {
      try {
        const raw = await this.customTransport.stream(
          {
            model,
            messages: formattedMessages,
            options: {
              temperature: options?.temperature,
              num_predict: options?.maxTokens,
            },
            stream: true,
            think,
            signal: options?.signal,
          },
          onToken
        );

        const promptTokens = raw?.prompt_eval_count ?? raw?.promptTokens ?? 0;
        const completionTokens = raw?.eval_count ?? raw?.completionTokens ?? 0;

        return {
          text: raw?.text ?? raw?.content ?? "",
          promptTokens,
          completionTokens,
          totalTokens: raw?.totalTokens ?? (promptTokens + completionTokens),
          model,
          provider: this.providerName,
        };
      } catch (err: any) {
        throw this.mapError(err, model);
      }
    }

    if (options?.signal?.aborted) {
      throw new ProviderFailureError(
        `Ollama request was cancelled or aborted. (model: ${model})`,
        this.providerName
      );
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: formattedMessages,
          stream: true,
          think,
          options: {
            temperature: options?.temperature ?? 0.1,
            num_predict: options?.maxTokens ?? 1500,
          },
        }),
        signal: options?.signal,
      });

      if (!res.ok) {
        let errorBody = "";
        try {
          errorBody = await res.text();
        } catch {
          // ignore
        }
        const err = new Error(errorBody || `HTTP ${res.status} ${res.statusText}`);
        (err as any).status = res.status;
        throw err;
      }

      if (!res.body) {
        throw new ProviderFailureError(
          `Ollama response body is empty. (model: ${model})`,
          this.providerName
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        if (options?.signal?.aborted) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          throw new ProviderFailureError(
            `Ollama request was cancelled or aborted. (model: ${model})`,
            this.providerName
          );
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let chunk: any;
          try {
            chunk = JSON.parse(trimmed);
          } catch (parseErr: any) {
            throw new ProviderFailureError(
              `Ollama returned malformed JSON chunk: ${parseErr.message} (model: ${model})`,
              this.providerName
            );
          }

          if (chunk.message?.content) {
            fullText += chunk.message.content;
            onToken(chunk.message.content);
          }

          if (chunk.done) {
            promptTokens = chunk.prompt_eval_count ?? promptTokens;
            completionTokens = chunk.eval_count ?? completionTokens;
          }
        }
      }

      // Process any trailing line in buffer
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer.trim());
          if (chunk.message?.content) {
            fullText += chunk.message.content;
            onToken(chunk.message.content);
          }
          if (chunk.done) {
            promptTokens = chunk.prompt_eval_count ?? promptTokens;
            completionTokens = chunk.eval_count ?? completionTokens;
          }
        } catch {
          // ignore trailing partial line
        }
      }

      if (promptTokens === 0) {
        promptTokens = Math.ceil(messages.map((m) => m.content).join(" ").length / 4);
      }
      if (completionTokens === 0) {
        completionTokens = Math.ceil(fullText.length / 4);
      }

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
   * Embeddings continuity: delegated to existing 1536d provider for pgvector compatibility.
   */
  async generateEmbedding(
    text: string,
    options?: { model?: string; taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" | string }
  ): Promise<{ embedding: number[]; dimension: number; model: string }> {
    return this.embeddingDelegate.generateEmbedding(text, options);
  }

  async generateBatchEmbeddings(
    texts: string[],
    options?: { model?: string; taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" | string }
  ): Promise<Array<{ embedding: number[]; dimension: number; model: string }>> {
    return this.embeddingDelegate.generateBatchEmbeddings(texts, options);
  }

  /**
   * Parses raw chat completion response into unified CompletionResult.
   */
  private parseChatResponse(
    data: any,
    model: string,
    messages: CompletionMessage[]
  ): CompletionResult {
    const message = data.message || data.choices?.[0]?.message;
    const text = message?.content || data.text || "";

    let toolCalls: ToolCallRequest[] | undefined;
    const rawToolCalls = message?.tool_calls || data.toolCalls;

    if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
      toolCalls = rawToolCalls.map((tc: any, index: number) => {
        const fn = tc.function || tc;
        let args = fn.arguments;
        if (typeof args !== "string") {
          args = JSON.stringify(args || {});
        }
        return {
          id: tc.id || fn.id || `call_${index}_${Math.random().toString(36).slice(2, 8)}`,
          name: fn.name || "",
          arguments: args,
        };
      });
    }

    const promptTokens =
      data.prompt_eval_count ??
      data.usage?.prompt_tokens ??
      data.promptTokens ??
      Math.ceil(messages.map((m) => m.content).join(" ").length / 4);

    const completionTokens =
      data.eval_count ??
      data.usage?.completion_tokens ??
      data.completionTokens ??
      Math.ceil(text.length / 4);

    const totalTokens =
      data.totalTokens ??
      data.usage?.total_tokens ??
      promptTokens + completionTokens;

    return {
      text,
      toolCalls,
      promptTokens,
      completionTokens,
      totalTokens,
      model,
      provider: this.providerName,
    };
  }

  /**
   * Validates configured Ollama model name.
   */
  private validateModel(model: string): void {
    if (!model || model.trim().length === 0) {
      throw new ConfigurationError("Ollama model cannot be empty.");
    }
  }

  /**
   * Maps Ollama, HTTP, network, and parse errors into standard ProviderFailureError.
   */
  private mapError(error: any, model: string): Error {
    if (error instanceof ProviderFailureError || error instanceof ConfigurationError) {
      return error;
    }

    const status = error.status || error.statusCode || error.response?.status;
    const message = error.message || "Unknown Ollama error";

    // 404 or model not found
    if (status === 404 || /model.*not found|not found/i.test(message)) {
      return new ProviderFailureError(
        `Ollama model '${model}' not found. Please verify the model is pulled ('ollama pull ${model}'). (model: ${model})`,
        this.providerName
      );
    }

    // Connection refused / service unavailable
    if (
      /fetch failed|econnrefused|failed to fetch|connect econnrefused|network error/i.test(message) ||
      status === 502 ||
      status === 503
    ) {
      return new ProviderFailureError(
        `Ollama service unavailable at ${this.baseUrl}. Please verify Ollama is running. (model: ${model})`,
        this.providerName
      );
    }

    // Aborted / Cancelled
    if (
      /abort|cancel/i.test(message) ||
      error.name === "AbortError" ||
      error.code === "ABORT_ERR"
    ) {
      return new ProviderFailureError(
        `Ollama request was cancelled or aborted. (model: ${model})`,
        this.providerName
      );
    }

    // Timeout
    if (/timeout|timed out|etimedout/i.test(message)) {
      return new ProviderFailureError(
        `Ollama request timed out. (model: ${model})`,
        this.providerName
      );
    }

    // Malformed JSON / parsing
    if (/malformed|unexpected token|invalid json/i.test(message) || error.name === "SyntaxError") {
      return new ProviderFailureError(
        `Ollama returned malformed response: ${message} (model: ${model})`,
        this.providerName
      );
    }

    return new ProviderFailureError(
      `Ollama completion failed: ${message} (model: ${model})`,
      this.providerName
    );
  }
}
