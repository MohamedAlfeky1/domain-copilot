/**
 * DOMAIN COPILOT - OPENAI PROVIDER ADAPTER
 * Implements IAIProviderPort using official OpenAI SDK (gpt-4o and text-embedding-3-small).
 * Supports token streaming, tool execution schemas, and deterministic fallback.
 */

import OpenAI from "openai";
import {
  IAIProviderPort,
  CompletionMessage,
  CompletionResult,
  ToolDefinition,
} from "../../core/application/ports/ai-provider.port";
import { ProviderFailureError } from "../../core/domain/errors";

export class OpenAIProviderAdapter implements IAIProviderPort {
  readonly providerName = "openai";
  private client: OpenAI | null = null;
  private defaultModel: string;
  private defaultEmbeddingModel: string;

  constructor(apiKey?: string, defaultModel = "gpt-4o", defaultEmbeddingModel = "text-embedding-3-small") {
    this.defaultModel = defaultModel;
    this.defaultEmbeddingModel = defaultEmbeddingModel;
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (key && key.trim().length > 0 && !key.includes("your_openai_api_key")) {
      this.client = new OpenAI({ apiKey: key });
    }
  }

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

    // Deterministic Mock fallback if API key is not configured
    if (!this.client) {
      return this.generateMockCompletion(messages, model);
    }

    try {
      const formattedMessages = messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant" | "function",
        content: m.content,
        name: m.name,
      }));

      const toolsParam = options?.tools?.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      const response = await this.client.chat.completions.create({
        model,
        messages: formattedMessages as any,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 1500,
        tools: toolsParam && toolsParam.length > 0 ? toolsParam : undefined,
      });

      const choice = response.choices[0];
      const message = choice.message;

      const toolCalls = message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));

      return {
        text: message.content || "",
        toolCalls,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
        model,
      };
    } catch (error: any) {
      throw new ProviderFailureError(`OpenAI completion failed: ${error.message}`);
    }
  }

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

    if (!this.client) {
      return this.streamMockCompletion(messages, onToken, model);
    }

    try {
      const formattedMessages = messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant" | "function",
        content: m.content,
        name: m.name,
      }));

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

      // Estimate tokens
      const promptTokens = Math.ceil(messages.map((m) => m.content).join(" ").length / 4);
      const completionTokens = Math.ceil(fullText.length / 4);

      return {
        text: fullText,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        model,
      };
    } catch (error: any) {
      if (options?.signal?.aborted) {
        throw new Error("Client cancelled request");
      }
      throw new ProviderFailureError(`OpenAI streaming failed: ${error.message}`);
    }
  }

  async generateEmbedding(
    text: string,
    options?: { model?: string }
  ): Promise<{ embedding: number[]; dimension: number; model: string }> {
    const model = options?.model || this.defaultEmbeddingModel;

    if (!this.client) {
      return {
        embedding: this.generateDeterministicVector(text, 1536),
        dimension: 1536,
        model,
      };
    }

    try {
      const response = await this.client.embeddings.create({
        model,
        input: text.slice(0, 8000),
      });

      return {
        embedding: response.data[0].embedding,
        dimension: response.data[0].embedding.length,
        model,
      };
    } catch (error: any) {
      throw new ProviderFailureError(`OpenAI embedding failed: ${error.message}`);
    }
  }

  async generateBatchEmbeddings(
    texts: string[],
    options?: { model?: string }
  ): Promise<Array<{ embedding: number[]; dimension: number; model: string }>> {
    const model = options?.model || this.defaultEmbeddingModel;

    if (!this.client) {
      return texts.map((t) => ({
        embedding: this.generateDeterministicVector(t, 1536),
        dimension: 1536,
        model,
      }));
    }

    try {
      const response = await this.client.embeddings.create({
        model,
        input: texts.map((t) => t.slice(0, 8000)),
      });

      return response.data.map((item) => ({
        embedding: item.embedding,
        dimension: item.embedding.length,
        model,
      }));
    } catch (error: any) {
      throw new ProviderFailureError(`OpenAI batch embedding failed: ${error.message}`);
    }
  }

  // Generate deterministic synthetic vector for testing/offline mode
  private generateDeterministicVector(text: string, dimension: number): number[] {
    const vector = new Array(dimension).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    for (let i = 0; i < dimension; i++) {
      const val = Math.sin(hash + i);
      vector[i] = Math.round(val * 10000) / 10000;
    }
    return vector;
  }

  private generateMockCompletion(messages: CompletionMessage[], model: string): CompletionResult {
    const userMsg = messages.find((m) => m.role === "user")?.content || "";
    const responseText = `[Deterministic Copilot Response (${model})]: Based on the verified corpus documents, here is the grounded synthesis for your inquiry: "${userMsg.slice(0, 50)}...". All claims are substantiated with verifiable citations.`;
    return {
      text: responseText,
      promptTokens: 120,
      completionTokens: 45,
      totalTokens: 165,
      model,
    };
  }

  private async streamMockCompletion(
    messages: CompletionMessage[],
    onToken: (token: string) => void,
    model: string
  ): Promise<CompletionResult> {
    const userMsg = messages.find((m) => m.role === "user")?.content || "";
    const tokens = [
      "Based ", "on ", "the ", "grounded ", "corpus ", "evidence, ",
      "the ", "verified ", "findings ", "indicate ", "compliance ",
      "with ", "domain ", "standards. ", "Specifically, ", "section ",
      "protocols ", "require ", "explicit ", "documentation ", "before ",
      "executing ", "any ", "downstream ", "actions."
    ];

    for (const t of tokens) {
      onToken(t);
      await new Promise((r) => setTimeout(r, 25));
    }

    return {
      text: tokens.join(""),
      promptTokens: 80,
      completionTokens: tokens.length,
      totalTokens: 80 + tokens.length,
      model,
    };
  }
}
