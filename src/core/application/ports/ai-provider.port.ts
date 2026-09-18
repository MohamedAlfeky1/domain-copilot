/**
 * DOMAIN COPILOT - AI PROVIDER PORT
 * Abstraction for completion, streaming, tool-calling and embedding operations.
 * Allows seamless switching between OpenAI (gpt-4o) and local/alternative providers.
 */

export interface CompletionMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: string; // JSON string
}

export interface CompletionResult {
  text: string;
  toolCalls?: ToolCallRequest[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  provider?: string;
}

export interface StreamEvent {
  type: "token" | "tool_call" | "done" | "error";
  token?: string;
  toolCall?: ToolCallRequest;
  totalTokens?: number;
}

export interface IEmbeddingProviderPort {
  readonly providerName: string;

  generateEmbedding(
    text: string,
    options?: { model?: string; taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" | string }
  ): Promise<{ embedding: number[]; dimension: number; model: string }>;

  generateBatchEmbeddings(
    texts: string[],
    options?: { model?: string; taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" | string }
  ): Promise<Array<{ embedding: number[]; dimension: number; model: string }>>;
}

export interface IAIProviderPort extends IEmbeddingProviderPort {
  readonly providerName: string;

  generateCompletion(
    messages: CompletionMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      tools?: ToolDefinition[];
    }
  ): Promise<CompletionResult>;

  streamCompletion(
    messages: CompletionMessage[],
    onToken: (token: string) => void,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
    }
  ): Promise<CompletionResult>;

  generateEmbedding(
    text: string,
    options?: { model?: string; taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" | string }
  ): Promise<{ embedding: number[]; dimension: number; model: string }>;

  generateBatchEmbeddings(
    texts: string[],
    options?: { model?: string; taskType?: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" | string }
  ): Promise<Array<{ embedding: number[]; dimension: number; model: string }>>;

  calculateCost?(promptTokens: number, completionTokens: number): number;
}
