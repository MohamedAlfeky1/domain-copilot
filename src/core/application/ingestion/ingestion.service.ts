/**
 * DOMAIN COPILOT - INGESTION PIPELINE SERVICE
 * Implements 5-stage pipeline: Extract -> Clean -> Chunk -> Embed -> Index
 * Features: Idempotent re-ingestion, versioning, structure-aware chunking, stable IDs.
 */

import { createHash } from "crypto";
import { Document, DocumentVersion, Chunk, IngestionJob } from "../../domain/types";
import { IDatabasePort } from "../ports/database.port";
import { IVectorStorePort } from "../ports/vector-store.port";
import { IAIProviderPort } from "../ports/ai-provider.port";
import { IngestionFailedError } from "../../domain/errors";

export interface IngestionInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  source?: string;
}

export class IngestionService {
  constructor(
    private db: IDatabasePort,
    private vectorStore: IVectorStorePort,
    private aiProvider: IAIProviderPort
  ) {}

  async ingestDocument(input: IngestionInput): Promise<{ document: Document; version: DocumentVersion; job: IngestionJob }> {
    const contentHash = createHash("sha256").update(input.buffer).digest("hex");
    const rawText = input.buffer.toString("utf-8"); // Supports text, markdown, synthetic corpus

    // 1. Check existing document for idempotency (ING-006)
    let doc = await this.db.getDocumentByHash(contentHash);
    let versionNum = 1;

    if (doc) {
      const activeVersion = await this.db.getActiveVersion(doc.id);
      if (activeVersion && activeVersion.contentHash === contentHash) {
        // Document with identical content already ingested
        const existingJob = (await this.db.listIngestionJobs()).find(
          (j) => j.documentVersionId === activeVersion.id
        );
        return {
          document: doc,
          version: activeVersion,
          job: existingJob || {
            id: `job-${activeVersion.id}`,
            documentVersionId: activeVersion.id,
            stage: "INDEX",
            status: "COMPLETED",
            progressPct: 100,
            retryCount: 0,
          },
        };
      }
      versionNum = (activeVersion?.version || 1) + 1;
    } else {
      doc = await this.db.saveDocument({
        id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        source: input.source || input.filename,
        name: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        contentHash,
        status: "PROCESSING",
        createdAt: new Date().toISOString(),
      });
    }

    // 2. Create Document Version
    const version: DocumentVersion = await this.db.saveDocumentVersion({
      id: `ver-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      documentId: doc.id,
      version: versionNum,
      contentHash,
      language: "en",
      pages: Math.max(1, Math.ceil(rawText.length / 2500)),
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    const job: IngestionJob = await this.db.saveIngestionJob({
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      documentVersionId: version.id,
      stage: "EXTRACT",
      status: "RUNNING",
      progressPct: 10,
      retryCount: 0,
      startedAt: new Date().toISOString(),
    });

    try {
      // Stage 1: Extract
      await this.db.updateIngestionJob({ id: job.id, stage: "EXTRACT", progressPct: 20 });
      const extractedContent = this.extractStage(input.filename, rawText);

      // Stage 2: Clean
      await this.db.updateIngestionJob({ id: job.id, stage: "CLEAN", progressPct: 40 });
      const cleanedContent = this.cleanStage(extractedContent);

      // Stage 3: Structure-Aware Chunking (ING-003)
      await this.db.updateIngestionJob({ id: job.id, stage: "CHUNK", progressPct: 60 });
      const chunks = this.chunkStage(cleanedContent, version.id, doc.name);
      await this.db.saveChunks(chunks);

      // Stage 4: Embed (ING-004)
      await this.db.updateIngestionJob({ id: job.id, stage: "EMBED", progressPct: 80 });
      const textsToEmbed = chunks.map((c) => c.text);
      const embeddings = await this.aiProvider.generateBatchEmbeddings(textsToEmbed);

      // Stage 5: Index (ING-005)
      await this.db.updateIngestionJob({ id: job.id, stage: "INDEX", progressPct: 95 });
      const chunkEmbeddings = chunks.map((c, idx) => ({
        id: `emb-${c.id}`,
        chunkId: c.id,
        model: embeddings[idx].model,
        dimension: embeddings[idx].dimension,
        vector: embeddings[idx].embedding,
        createdAt: new Date().toISOString(),
      }));

      await this.vectorStore.saveBatchEmbeddings(chunkEmbeddings);

      // Complete
      await this.db.updateIngestionJob({
        id: job.id,
        stage: "INDEX",
        status: "COMPLETED",
        progressPct: 100,
        completedAt: new Date().toISOString(),
      });

      doc.status = "COMPLETED";
      doc.currentVersionId = version.id;
      await this.db.saveDocument(doc);

      return { document: doc, version, job };
    } catch (err: any) {
      await this.db.updateIngestionJob({
        id: job.id,
        status: "FAILED",
        errorCode: "PIPELINE_ERROR",
        errorMessage: err.message,
      });
      doc.status = "FAILED";
      await this.db.saveDocument(doc);
      throw new IngestionFailedError(`Ingestion pipeline failed: ${err.message}`);
    }
  }

  private extractStage(filename: string, text: string): string {
    if (!text || text.trim().length === 0) {
      throw new Error(`File ${filename} contains no extractable text`);
    }
    return text;
  }

  private cleanStage(text: string): string {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private chunkStage(text: string, versionId: string, docName: string): Chunk[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: Chunk[] = [];
    let currentChunkText = "";
    let currentSection = "General";
    let chunkIndex = 0;
    let currentPage = 1;

    for (const para of paragraphs) {
      // Heading detection
      if (para.startsWith("#") || /^[A-Z0-9\s.:-]{3,40}$/m.test(para.slice(0, 40))) {
        currentSection = para.replace(/^#+\s*/, "").split("\n")[0].trim();
      }

      if ((currentChunkText + "\n\n" + para).length > 800 && currentChunkText.length > 0) {
        // Stable chunk id
        const chunkHash = createHash("md5").update(`${versionId}:${chunkIndex}:${currentChunkText}`).digest("hex");
        chunks.push({
          id: `chk-${chunkHash.slice(0, 16)}`,
          documentVersionId: versionId,
          chunkIndex,
          section: currentSection,
          page: currentPage,
          clause: `Section ${currentSection.slice(0, 15)}`,
          text: currentChunkText.trim(),
          tokenCount: Math.ceil(currentChunkText.length / 4),
          metadata: {
            documentName: docName,
            section: currentSection,
            page: currentPage,
          },
          createdAt: new Date().toISOString(),
        });
        chunkIndex++;
        if (chunkIndex % 3 === 0) currentPage++;
        currentChunkText = para;
      } else {
        currentChunkText = currentChunkText ? `${currentChunkText}\n\n${para}` : para;
      }
    }

    if (currentChunkText.trim().length > 0) {
      const chunkHash = createHash("md5").update(`${versionId}:${chunkIndex}:${currentChunkText}`).digest("hex");
      chunks.push({
        id: `chk-${chunkHash.slice(0, 16)}`,
        documentVersionId: versionId,
        chunkIndex,
        section: currentSection,
        page: currentPage,
        clause: `Section ${currentSection.slice(0, 15)}`,
        text: currentChunkText.trim(),
        tokenCount: Math.ceil(currentChunkText.length / 4),
        metadata: {
          documentName: docName,
          section: currentSection,
          page: currentPage,
        },
        createdAt: new Date().toISOString(),
      });
    }

    return chunks;
  }
}
