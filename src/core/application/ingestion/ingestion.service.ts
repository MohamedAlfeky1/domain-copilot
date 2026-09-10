/**
 * Five-stage ingestion pipeline (ING-001 to ING-007).
 * Every stage is persisted before and after execution, which makes a failed
 * upload observable and safe to retry with the same source bytes.
 */
import { createHash } from "crypto";
import { Document, DocumentVersion, Chunk, IngestionJob, IngestionStage } from "../../domain/types";
import { IDatabasePort } from "../ports/database.port";
import { IVectorStorePort } from "../ports/vector-store.port";
import { IAIProviderPort } from "../ports/ai-provider.port";
import { IngestionFailedError } from "../../domain/errors";
import { DeterministicCleaner, ExtractorRegistry, ExtractionResult } from "./extraction";

export interface IngestionInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  source?: string;
}

const STAGE_PROGRESS: Record<IngestionStage, number> = {
  EXTRACT: 15,
  CLEAN: 35,
  CHUNK: 55,
  EMBED: 75,
  INDEX: 92,
};

export class IngestionService {
  private readonly extractors = new ExtractorRegistry();
  private readonly cleaner = new DeterministicCleaner();

  constructor(
    private db: IDatabasePort,
    private vectorStore: IVectorStorePort,
    private aiProvider: IAIProviderPort
  ) {}

  async ingestDocument(input: IngestionInput): Promise<{ document: Document; version: DocumentVersion; job: IngestionJob; duplicate: boolean }> {
    const source = input.source || input.filename;
    const contentHash = createHash("sha256").update(input.buffer).digest("hex");
    let doc = await this.db.getDocumentBySource(source, input.filename);
    const isRetry = doc?.status === "FAILED";
    let version: DocumentVersion;

    if (doc) {
      const activeVersion = await this.db.getActiveVersion(doc.id);
      if (activeVersion?.contentHash === contentHash && doc.status === "INDEXED") {
        const existingJob = (await this.db.listIngestionJobs()).find((item) => item.documentVersionId === activeVersion.id && item.status === "COMPLETED");
        return {
          document: doc,
          version: activeVersion,
          duplicate: true,
          job: existingJob || this.completedJob(activeVersion.id),
        };
      }

      if (activeVersion && activeVersion.contentHash !== contentHash) {
        await this.db.archiveActiveVersions(doc.id);
      }

      doc = { ...doc, contentHash, mimeType: input.mimeType, sizeBytes: input.buffer.length, status: "QUEUED" };
      await this.db.saveDocument(doc);
      version = activeVersion?.contentHash === contentHash
        ? activeVersion
        : await this.createVersion(doc, contentHash, 1 + (activeVersion?.version || 0));
    } else {
      const sourceKey = createHash("sha256").update(`${source}\u0000${input.filename}`).digest("hex");
      doc = await this.db.saveDocument({
        id: this.stableId("doc", sourceKey),
        source,
        name: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        contentHash,
        status: "QUEUED",
        createdAt: new Date().toISOString(),
      });
      version = await this.createVersion(doc, contentHash, 1);
    }

    doc = { ...doc, currentVersionId: version.id };
    await this.db.saveDocument(doc);

    const job: IngestionJob = await this.db.saveIngestionJob({
      id: this.stableId("job", `${version.id}:${contentHash}:${Date.now()}`),
      documentVersionId: version.id,
      stage: "EXTRACT",
      status: "QUEUED",
      progressPct: 0,
      retryCount: isRetry ? 1 : 0,
    });

    try {
      await this.db.updateIngestionJob({ id: job.id, status: "RUNNING", startedAt: new Date().toISOString() });
      doc.status = "PROCESSING";
      await this.db.saveDocument(doc);

      const extracted = await this.runStage(job, "EXTRACT", () => this.extractors.extract(input.filename, input.mimeType, input.buffer));
      version = { ...version, pages: extracted.pages.length };
      await this.db.saveDocumentVersion(version);
      const cleaned = await this.runStage(job, "CLEAN", () => this.cleaner.clean(extracted));
      const chunks = await this.runStage(job, "CHUNK", () => this.chunkStage(cleaned.pages, version.id, doc.name, contentHash));
      await this.db.saveChunks(chunks);
      const embeddings = await this.runStage(job, "EMBED", () => this.aiProvider.generateBatchEmbeddings(chunks.map((chunk) => chunk.text)));
      await this.runStage(job, "INDEX", async () => {
        await this.vectorStore.saveBatchEmbeddings(chunks.map((chunk, index) => ({
          id: this.stableId("emb", `${chunk.id}:${embeddings[index].model}`),
          chunkId: chunk.id,
          model: embeddings[index].model,
          dimension: embeddings[index].dimension,
          vector: embeddings[index].embedding,
          createdAt: new Date().toISOString(),
        })));
      });

      const completedAt = new Date().toISOString();
      await this.db.updateIngestionJob({ id: job.id, stage: "INDEX", status: "COMPLETED", progressPct: 100, completedAt });
      doc.status = "INDEXED";
      doc.currentVersionId = version.id;
      await this.db.saveDocument(doc);
      return { document: doc, version, job: { ...job, stage: "INDEX", status: "COMPLETED", progressPct: 100, completedAt }, duplicate: false };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown ingestion error";
      await this.db.updateIngestionJob({ id: job.id, status: "FAILED", errorCode: this.errorCode(error), errorMessage: message, completedAt: new Date().toISOString() });
      doc.status = "FAILED";
      await this.db.saveDocument(doc);
      throw new IngestionFailedError(`Ingestion failed at ${job.stage}: ${message}`);
    }
  }

  private async createVersion(document: Document, contentHash: string, versionNumber: number): Promise<DocumentVersion> {
    return this.db.saveDocumentVersion({
      id: this.stableId("ver", `${document.id}:${contentHash}`),
      documentId: document.id,
      version: versionNumber,
      contentHash,
      language: "en",
      pages: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  }

  private async runStage<T>(job: IngestionJob, stage: IngestionStage, action: () => Promise<T> | T): Promise<T> {
    job.stage = stage;
    job.progressPct = STAGE_PROGRESS[stage];
    await this.db.updateIngestionJob({ id: job.id, stage, status: "RUNNING", progressPct: job.progressPct });
    return action();
  }

  private chunkStage(pages: Array<{ number: number; text: string }>, versionId: string, docName: string, sourceHash: string): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;
    let currentSection = "General";
    const flush = (text: string, page: number) => {
      const normalized = text.trim();
      if (!normalized) return;
      const id = this.stableId("chk", `${sourceHash}:${chunkIndex}`);
      chunks.push({
        id,
        documentVersionId: versionId,
        chunkIndex,
        section: currentSection,
        page,
        clause: currentSection,
        text: normalized,
        tokenCount: Math.ceil(normalized.length / 4),
        metadata: { documentName: docName, sourceHash, section: currentSection, page, versionId },
        createdAt: new Date().toISOString(),
      });
      chunkIndex++;
    };

    for (const page of pages) {
      let buffer = "";
      for (const paragraph of page.text.split(/\n\s*\n+/).map((item) => item.trim()).filter(Boolean)) {
        const heading = paragraph.split("\n")[0];
        if (/^#{1,6}\s+/.test(heading) || /^[A-Z][A-Z0-9 ,.:;()/-]{3,100}$/.test(heading)) {
          currentSection = heading.replace(/^#{1,6}\s*/, "").trim();
        }
        // Never split a paragraph: citation-critical sentences retain context.
        if (buffer && buffer.length + paragraph.length + 2 > 900) {
          flush(buffer, page.number);
          buffer = paragraph;
        } else {
          buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
        }
      }
      flush(buffer, page.number);
    }
    return chunks;
  }

  private stableId(prefix: string, value: string): string {
    const hex = createHash("sha256").update(`${prefix}:${value}`).digest("hex");
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
    return uuid;
  }

  private completedJob(versionId: string): IngestionJob {
    return { id: this.stableId("job", versionId), documentVersionId: versionId, stage: "INDEX", status: "COMPLETED", progressPct: 100, retryCount: 0 };
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
      return (error as { code: string }).code;
    }
    return "PIPELINE_ERROR";
  }
}
