/**
 * DOMAIN COPILOT - HYBRID RETRIEVAL SERVICE
 * Implements Dense pgvector + PostgreSQL Keyword Search (FTS) + Reciprocal Rank Fusion (RRF)
 * Features: Metadata scope filtering (source, doc, version, section, page, language),
 * Incompatible scope rejection, structured citations, low-evidence refusal gate,
 * and comprehensive retrieval trace inspector telemetry.
 */

import { Citation, Chunk } from "../../domain/types";
import {
  IVectorStorePort,
  RetrievalScopeFilter,
  VectorSearchResult,
  KeywordSearchResult,
} from "../ports/vector-store.port";
import { IAIProviderPort } from "../ports/ai-provider.port";
import { IDatabasePort } from "../ports/database.port";
import { IncompatibleFilterScopeError } from "../../domain/errors";

export interface CandidateTraceItem {
  chunkId: string;
  documentName: string;
  version: number;
  section?: string;
  page?: number;
  score: number;
  rank: number;
  channel: "dense" | "keyword" | "fused";
  textSnippet: string;
  explanation?: string;
}

export interface FusedTraceItem {
  chunkId: string;
  documentName: string;
  version: number;
  section?: string;
  page?: number;
  denseRank: number | null;
  denseScore: number | null;
  keywordRank: number | null;
  keywordScore: number | null;
  rrfScore: number;
  channel: "dense" | "keyword" | "fused";
  explanation: string;
  textSnippet: string;
}

export interface RetrievalTraceData {
  query: string;
  correlationId?: string;
  appliedFilters: RetrievalScopeFilter;
  denseTopK: CandidateTraceItem[];
  keywordTopK: CandidateTraceItem[];
  fusedResults: FusedTraceItem[];
  selectedChunks: string[];
  totalConsideredCandidates: number;
  evidenceScore: number;
  refusalThreshold: number;
  refusalTriggered: boolean;
  refusalDecision: "PROCEED" | "REFUSED";
  refusalReason?: string;
  fusionFormula: string;
}

export interface RetrievalResult {
  chunks: Chunk[];
  citations: Citation[];
  evidenceScore: number;
  isRefusalRequired: boolean;
  refusalReason?: string;
  trace: RetrievalTraceData;
}

export interface HybridRetrieverOptions {
  rrfK?: number;
  denseWeight?: number;
  keywordWeight?: number;
  topK?: number;
  evidenceThreshold?: number;
  minSimilarity?: number;
}

export class HybridRetrievalService {
  private readonly rrfK: number;
  private readonly denseWeight: number;
  private readonly keywordWeight: number;
  private readonly topK: number;
  private readonly evidenceThreshold: number;
  private readonly minSimilarity: number;

  constructor(
    private vectorStore: IVectorStorePort,
    private aiProvider: IAIProviderPort,
    private db: IDatabasePort,
    options?: HybridRetrieverOptions
  ) {
    this.rrfK = options?.rrfK ?? 60;
    this.denseWeight = options?.denseWeight ?? 1.0;
    this.keywordWeight = options?.keywordWeight ?? 1.0;
    this.topK = options?.topK ?? 5;
    this.evidenceThreshold = options?.evidenceThreshold ?? 0.015;
    this.minSimilarity = options?.minSimilarity ?? 0.15;
  }

  async validateFilterScope(filter?: RetrievalScopeFilter): Promise<void> {
    if (!filter) return;

    // Validate documentId if provided
    if (filter.documentId) {
      const doc = await this.db.getDocumentById(filter.documentId);
      if (!doc) {
        throw new IncompatibleFilterScopeError(
          `Incompatible filter scope: Document ID "${filter.documentId}" does not exist in corpus.`
        );
      }

      // If version is specified, check that the version exists for this document
      if (filter.version !== undefined) {
        const activeVer = await this.db.getActiveVersion(filter.documentId);
        if (activeVer && activeVer.version !== filter.version) {
          // Check if version exists in history
          const docs = await this.db.listDocuments();
          const targetDoc = docs.find((d) => d.id === filter.documentId);
          if (!targetDoc) {
            throw new IncompatibleFilterScopeError(
              `Incompatible filter scope: Version ${filter.version} does not exist for Document "${filter.documentId}".`
            );
          }
        }
      }
    }

    // Validate source if provided
    if (filter.source) {
      const docs = await this.db.listDocuments();
      const match = docs.some(
        (d) => d.source.toLowerCase() === filter.source!.toLowerCase() || d.name.toLowerCase() === filter.source!.toLowerCase()
      );
      if (!match) {
        throw new IncompatibleFilterScopeError(
          `Incompatible filter scope: Source "${filter.source}" does not match any document in the corpus.`
        );
      }
    }

    // Validate page range
    if (filter.pageRange) {
      const { start, end } = filter.pageRange;
      if (start !== undefined && end !== undefined && start > end) {
        throw new IncompatibleFilterScopeError(
          `Incompatible filter scope: Invalid page range start (${start}) cannot exceed end (${end}).`
        );
      }
    }
  }

  async retrieve(
    query: string,
    filter?: RetrievalScopeFilter,
    correlationId?: string
  ): Promise<RetrievalResult> {
    // 1. Validate Scope & Reject Incompatible Filters (RET-002)
    await this.validateFilterScope(filter);

    const appliedFilters: RetrievalScopeFilter = {
      ...filter,
      includeInactiveVersions: filter?.includeInactiveVersions ?? false,
    };

    // 2. Parallel Dense Embedding & Execution (RET-001)
    // Dense search is inherently cross-lingual via text-embedding-3-small (multilingual model)
    const { embedding } = await this.aiProvider.generateEmbedding(query);

    // T1 Bilingual: Run keyword search with both 'english' and 'simple' FTS configs
    // to enable cross-lingual keyword matching (EN queries find AR content and vice versa)
    const [denseResults, keywordResultsEN, keywordResultsAR] = await Promise.all([
      this.vectorStore.searchSimilar(embedding, {
        topK: 10,
        minSimilarity: this.minSimilarity,
        ...appliedFilters,
      }),
      this.vectorStore.searchKeyword(query, {
        topK: 10,
        language: "english",
        ...appliedFilters,
      }),
      this.vectorStore.searchKeyword(query, {
        topK: 10,
        language: "simple",
        ...appliedFilters,
      }),
    ]);

    // T1 Bilingual: Merge keyword results from both FTS configs, dedup by chunk ID
    const seenKeywordChunks = new Set<string>();
    const keywordResults: typeof keywordResultsEN = [];
    for (const res of [...keywordResultsEN, ...keywordResultsAR]) {
      if (!seenKeywordChunks.has(res.chunk.id)) {
        seenKeywordChunks.add(res.chunk.id);
        keywordResults.push(res);
      }
    }
    keywordResults.sort((a, b) => b.rankScore - a.rankScore);

    // 3. Process Channel Candidates for Telemetry (RET-005)
    const denseCandidates: CandidateTraceItem[] = denseResults.map((d, index) => {
      const docName = (d.chunk.metadata.documentName as string) || "Document";
      return {
        chunkId: d.chunk.id,
        documentName: docName,
        version: Number(d.chunk.metadata.version || 1),
        section: d.chunk.section,
        page: d.chunk.page,
        score: Math.round(d.similarity * 10000) / 10000,
        rank: index + 1,
        channel: "dense",
        textSnippet: d.chunk.text.slice(0, 120),
        explanation: `Dense pgvector rank #${index + 1} with cosine similarity ${(d.similarity * 100).toFixed(1)}%`,
      };
    });

    const keywordCandidates: CandidateTraceItem[] = keywordResults.map((k, index) => {
      const docName = (k.chunk.metadata.documentName as string) || "Document";
      return {
        chunkId: k.chunk.id,
        documentName: docName,
        version: Number(k.chunk.metadata.version || 1),
        section: k.chunk.section,
        page: k.chunk.page,
        score: Math.round(k.rankScore * 10000) / 10000,
        rank: index + 1,
        channel: "keyword",
        textSnippet: k.chunk.text.slice(0, 120),
        explanation: `PostgreSQL Full-Text rank #${index + 1} with ts_rank ${(k.rankScore * 100).toFixed(1)}%`,
      };
    });

    // 4. Deterministic Reciprocal Rank Fusion (RRF) (RET-001)
    interface IntermediateFused {
      chunk: Chunk;
      denseRank: number | null;
      denseScore: number | null;
      keywordRank: number | null;
      keywordScore: number | null;
      rrfScore: number;
      channel: "dense" | "keyword" | "fused";
    }

    const fusionMap = new Map<string, IntermediateFused>();

    denseResults.forEach((res, idx) => {
      const rank = idx + 1;
      const score = this.denseWeight / (this.rrfK + rank);
      fusionMap.set(res.chunk.id, {
        chunk: res.chunk,
        denseRank: rank,
        denseScore: res.similarity,
        keywordRank: null,
        keywordScore: null,
        rrfScore: score,
        channel: "dense",
      });
    });

    keywordResults.forEach((res, idx) => {
      const rank = idx + 1;
      const score = this.keywordWeight / (this.rrfK + rank);
      const existing = fusionMap.get(res.chunk.id);
      if (existing) {
        existing.rrfScore += score;
        existing.keywordRank = rank;
        existing.keywordScore = res.rankScore;
        existing.channel = "fused";
      } else {
        fusionMap.set(res.chunk.id, {
          chunk: res.chunk,
          denseRank: null,
          denseScore: null,
          keywordRank: rank,
          keywordScore: res.rankScore,
          rrfScore: score,
          channel: "keyword",
        });
      }
    });

    // 5. Rank Fused Candidates
    const rankedCandidates: FusedTraceItem[] = Array.from(fusionMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .map((item, idx) => {
        const docName = (item.chunk.metadata.documentName as string) || "Document";
        const version = Number(item.chunk.metadata.version || 1);

        let explanation = "";
        if (item.channel === "fused") {
          explanation = `Elevated by dual-channel match: Dense rank #${item.denseRank} (${(item.denseScore! * 100).toFixed(1)}% sim) + Keyword rank #${item.keywordRank} (${(item.keywordScore! * 100).toFixed(1)}% FTS) -> Fused RRF ${item.rrfScore.toFixed(4)}`;
        } else if (item.channel === "dense") {
          explanation = `Ranked via semantic similarity only: Dense rank #${item.denseRank} (${(item.denseScore! * 100).toFixed(1)}% sim)`;
        } else {
          explanation = `Ranked via exact keyword match only: Keyword rank #${item.keywordRank} (${(item.keywordScore! * 100).toFixed(1)}% FTS)`;
        }

        return {
          chunkId: item.chunk.id,
          documentName: docName,
          version,
          section: item.chunk.section,
          page: item.chunk.page,
          denseRank: item.denseRank,
          denseScore: item.denseScore ? Math.round(item.denseScore * 1000) / 1000 : null,
          keywordRank: item.keywordRank,
          keywordScore: item.keywordScore ? Math.round(item.keywordScore * 1000) / 1000 : null,
          rrfScore: Math.round(item.rrfScore * 10000) / 10000,
          channel: item.channel,
          explanation,
          textSnippet: item.chunk.text.slice(0, 140),
        };
      });

    // 6. Candidate Selection & Low-Evidence Refusal Gate (RET-004)
    const topCandidates = rankedCandidates.slice(0, this.topK);
    const topScore = topCandidates.length > 0 ? topCandidates[0].rrfScore : 0;
    const isRefusalRequired = topCandidates.length === 0 || topScore < this.evidenceThreshold;

    const refusalReason = isRefusalRequired
      ? `The existing corpus contains insufficient evidence (support score: ${topScore.toFixed(4)}, floor: ${this.evidenceThreshold.toFixed(4)}) to answer this query without hallucination.`
      : undefined;

    // 7. Structured Citations with Exact Chunk Traceability (RET-003)
    const selectedChunks: Chunk[] = topCandidates.map((c) => fusionMap.get(c.chunkId)!.chunk);

    const citations: Citation[] = isRefusalRequired
      ? []
      : selectedChunks.map((chunk, index) => {
          const docName = (chunk.metadata.documentName as string) || "Document";
          const docSource = (chunk.metadata.source as string) || docName;
          const version = Number(chunk.metadata.version || 1);
          const candidate = topCandidates.find((c) => c.chunkId === chunk.id);

          return {
            citationId: `cite-${index + 1}`,
            chunkId: chunk.id,
            documentId: chunk.documentVersionId,
            documentName: docName,
            version,
            page: chunk.page,
            clause: chunk.clause || chunk.section,
            excerpt: chunk.text.slice(0, 200).trim() + (chunk.text.length > 200 ? "..." : ""),
            score: candidate?.rrfScore ?? 0,
            channel: candidate?.channel ?? "fused",
            source: docSource,
          };
        });

    // 8. Compile Complete Trace Inspector Object (RET-005)
    const trace: RetrievalTraceData = {
      query,
      correlationId,
      appliedFilters,
      denseTopK: denseCandidates,
      keywordTopK: keywordCandidates,
      fusedResults: rankedCandidates,
      selectedChunks: selectedChunks.map((c) => c.id),
      totalConsideredCandidates: fusionMap.size,
      evidenceScore: Math.round(topScore * 10000) / 10000,
      refusalThreshold: this.evidenceThreshold,
      refusalTriggered: isRefusalRequired,
      refusalDecision: isRefusalRequired ? "REFUSED" : "PROCEED",
      refusalReason,
      fusionFormula: `RRF(d) = (${this.denseWeight} / (${this.rrfK} + rank_dense)) + (${this.keywordWeight} / (${this.rrfK} + rank_keyword))`,
    };

    return {
      chunks: selectedChunks,
      citations,
      evidenceScore: topScore,
      isRefusalRequired,
      refusalReason,
      trace,
    };
  }
}
