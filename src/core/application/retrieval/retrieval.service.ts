/**
 * DOMAIN COPILOT - HYBRID RETRIEVAL SERVICE
 * Implements Dense pgvector + PostgreSQL Keyword Search + Reciprocal Rank Fusion (RRF)
 * Features: Metadata filtering, structured citations, and low-evidence refusal gate.
 */

import { Citation, Chunk } from "../../domain/types";
import { IVectorStorePort } from "../ports/vector-store.port";
import { IAIProviderPort } from "../ports/ai-provider.port";
import { IDatabasePort } from "../ports/database.port";

export interface RetrievalFilter {
  documentVersionIds?: string[];
  section?: string;
  minSimilarity?: number;
}

export interface RetrievalTraceData {
  query: string;
  denseCandidates: Array<{ chunkId: string; similarity: number; textSnippet: string }>;
  keywordCandidates: Array<{ chunkId: string; rankScore: number; textSnippet: string }>;
  fusedResults: Array<{ chunkId: string; rrfScore: number; channel: string }>;
  evidenceScore: number;
  refusalTriggered: boolean;
}

export interface RetrievalResult {
  chunks: Chunk[];
  citations: Citation[];
  evidenceScore: number;
  isRefusalRequired: boolean;
  refusalReason?: string;
  trace: RetrievalTraceData;
}

export class HybridRetrievalService {
  private readonly RRF_K = 60;
  private readonly EVIDENCE_THRESHOLD = 0.015; // Minimum fused score or density

  constructor(
    private vectorStore: IVectorStorePort,
    private aiProvider: IAIProviderPort,
    private db: IDatabasePort
  ) {}

  async retrieve(query: string, filter?: RetrievalFilter): Promise<RetrievalResult> {
    // 1. Generate query embedding
    const { embedding } = await this.aiProvider.generateEmbedding(query);

    // 2. Parallel Dense + Keyword execution (RET-001)
    const [denseResults, keywordResults] = await Promise.all([
      this.vectorStore.searchSimilar(embedding, {
        topK: 10,
        minSimilarity: filter?.minSimilarity ?? 0.1,
        documentVersionIds: filter?.documentVersionIds,
        section: filter?.section,
      }),
      this.vectorStore.searchKeyword(query, {
        topK: 10,
        documentVersionIds: filter?.documentVersionIds,
      }),
    ]);

    // 3. Reciprocal Rank Fusion (RRF) calculation
    const scoresMap = new Map<string, { chunk: Chunk; rrfScore: number; channel: "dense" | "keyword" | "fused" }>();

    // Process dense ranks
    denseResults.forEach((res, rank) => {
      const score = 1 / (this.RRF_K + (rank + 1));
      scoresMap.set(res.chunk.id, {
        chunk: res.chunk,
        rrfScore: score,
        channel: "dense",
      });
    });

    // Process keyword ranks
    keywordResults.forEach((res, rank) => {
      const score = 1 / (this.RRF_K + (rank + 1));
      const existing = scoresMap.get(res.chunk.id);
      if (existing) {
        existing.rrfScore += score;
        existing.channel = "fused";
      } else {
        scoresMap.set(res.chunk.id, {
          chunk: res.chunk,
          rrfScore: score,
          channel: "keyword",
        });
      }
    });

    // 4. Sort by fused score
    const rankedCandidates = Array.from(scoresMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);
    const topChunks = rankedCandidates.slice(0, 5);

    // Calculate aggregate evidence score
    const topScore = topChunks.length > 0 ? topChunks[0].rrfScore : 0;
    const isRefusalRequired = topChunks.length === 0 || topScore < this.EVIDENCE_THRESHOLD;

    // 5. Build structured citations (RET-003)
    const citations: Citation[] = topChunks.map((item, idx) => {
      const docName = (item.chunk.metadata.documentName as string) || "Document";
      return {
        citationId: `cite-${idx + 1}`,
        chunkId: item.chunk.id,
        documentId: item.chunk.documentVersionId,
        documentName: docName,
        version: 1,
        page: item.chunk.page,
        clause: item.chunk.clause,
        excerpt: item.chunk.text.slice(0, 180) + "...",
        score: Math.round(item.rrfScore * 10000) / 10000,
        channel: item.channel,
      };
    });

    // 6. Trace payload for inspector (RET-005)
    const trace: RetrievalTraceData = {
      query,
      denseCandidates: denseResults.map((d) => ({
        chunkId: d.chunk.id,
        similarity: Math.round(d.similarity * 1000) / 1000,
        textSnippet: d.chunk.text.slice(0, 100),
      })),
      keywordCandidates: keywordResults.map((k) => ({
        chunkId: k.chunk.id,
        rankScore: Math.round(k.rankScore * 1000) / 1000,
        textSnippet: k.chunk.text.slice(0, 100),
      })),
      fusedResults: rankedCandidates.slice(0, 10).map((r) => ({
        chunkId: r.chunk.id,
        rrfScore: Math.round(r.rrfScore * 10000) / 10000,
        channel: r.channel,
      })),
      evidenceScore: Math.round(topScore * 10000) / 10000,
      refusalTriggered: isRefusalRequired,
    };

    return {
      chunks: topChunks.map((c) => c.chunk),
      citations,
      evidenceScore: topScore,
      isRefusalRequired,
      refusalReason: isRefusalRequired
        ? "The existing corpus contains insufficient evidence to reliably answer this query without hallucination."
        : undefined,
      trace,
    };
  }
}
