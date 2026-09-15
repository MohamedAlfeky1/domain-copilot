/**
 * DOMAIN COPILOT - VECTOR STORE PORT
 * Clean port interface for vector storage, similarity indexing, and hybrid search.
 */

import { Chunk, ChunkEmbedding } from "../../domain/types";

export interface VectorSearchResult {
  chunk: Chunk;
  similarity: number; // 0.0 to 1.0 (cosine similarity)
  score: number;
}

export interface HybridSearchResult {
  chunk: Chunk;
  denseScore: number;
  keywordScore: number;
  fusedScore: number;
  channel: "dense" | "keyword" | "fused";
}

export interface IVectorStorePort {
  saveEmbedding(embedding: ChunkEmbedding): Promise<void>;
  saveBatchEmbeddings(embeddings: ChunkEmbedding[]): Promise<void>;

  searchSimilar(
    queryEmbedding: number[],
    options: {
      topK: number;
      minSimilarity?: number;
      documentVersionIds?: string[];
      section?: string;
    }
  ): Promise<VectorSearchResult[]>;

  searchKeyword(
    queryText: string,
    options: {
      topK: number;
      documentVersionIds?: string[];
    }
  ): Promise<Array<{ chunk: Chunk; rankScore: number }>>;
}
