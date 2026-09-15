/**
 * DOMAIN COPILOT - VECTOR STORE PORT
 * Clean port interface for vector storage, similarity indexing, and hybrid search.
 * Supports metadata filtering across source, document, version, section, page range, and language (RET-002).
 */

import { Chunk, ChunkEmbedding } from "../../domain/types";

export interface RetrievalScopeFilter {
  source?: string;
  documentId?: string;
  version?: number;
  documentVersionIds?: string[];
  section?: string;
  page?: number;
  pageRange?: { start?: number; end?: number };
  language?: string;
  includeInactiveVersions?: boolean;
}

export interface VectorSearchResult {
  chunk: Chunk;
  similarity: number; // 0.0 to 1.0 (cosine similarity)
  score: number;
  explanation?: string;
}

export interface KeywordSearchResult {
  chunk: Chunk;
  rankScore: number;
  explanation?: string;
}

export interface HybridSearchResult {
  chunk: Chunk;
  denseScore: number;
  keywordScore: number;
  fusedScore: number;
  channel: "dense" | "keyword" | "fused";
  explanation?: string;
}

export interface VectorSearchOptions extends RetrievalScopeFilter {
  topK: number;
  minSimilarity?: number;
}

export interface KeywordSearchOptions extends RetrievalScopeFilter {
  topK: number;
  language?: string;
}

export interface IVectorStorePort {
  saveEmbedding(embedding: ChunkEmbedding): Promise<void>;
  saveBatchEmbeddings(embeddings: ChunkEmbedding[]): Promise<void>;

  searchSimilar(
    queryEmbedding: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]>;

  searchKeyword(
    queryText: string,
    options: KeywordSearchOptions
  ): Promise<KeywordSearchResult[]>;
}
