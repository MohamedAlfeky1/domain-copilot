import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { DomainError, UnsupportedFileTypeError, ValidationError } from "@/core/domain/errors";
import { createHash } from "crypto";
import { localStagingStorage } from "@/infrastructure/storage/local-staging.adapter";
import { requireAuth, requireRole } from "@/infrastructure/auth/auth-guard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const docs = await container.db.listDocuments();
    const totalChunks = await container.db.countTotalChunks();
    const jobs = await container.db.listIngestionJobs();
    return NextResponse.json({
      documents: docs,
      jobs,
      totalCount: docs.length,
      totalChunksIndexed: totalChunks,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.httpStatus || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["ADMIN"]);
    const contentType = req.headers.get("content-type") || "";

    let filename = `document-${Date.now()}.txt`;
    let mimeType = "text/plain";
    let buffer: Buffer;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided in form data" }, { status: 400 });
      }

      filename = file.name;
      mimeType = file.type;

      const bytes = await file.arrayBuffer();
      buffer = Buffer.from(bytes);
    } else {
      // JSON upload support for seeder/API scripts
      const body = await req.json();
      if (!body.content) {
        return NextResponse.json({ error: "Missing document 'content'" }, { status: 400 });
      }
      filename = body.filename || `document-${Date.now()}.txt`;
      mimeType = body.mimeType || "text/plain";
      buffer = Buffer.from(body.content, "utf-8");
    }

    const extension = filename.toLowerCase().match(/\.(pdf|docx|txt)$/)?.[0];
    const allowedMime: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".txt": "text/plain",
    };
    if (!extension || !allowedMime[extension]) {
      throw new UnsupportedFileTypeError(`Unsupported extension for "${filename}". Allowed extensions: .pdf, .docx, .txt.`);
    }
    const expectedMime = allowedMime[extension];
    if (mimeType && mimeType !== expectedMime) {
      throw new ValidationError(`MIME type mismatch for "${filename}": expected ${expectedMime}, received ${mimeType}.`);
    }
    mimeType = expectedMime;

    // Size limit: 25MB (ING-001)
    if (buffer.length > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds 25MB maximum size limit" }, { status: 400 });
    }

    await localStagingStorage.stage(createHash("sha256").update(buffer).digest("hex"), buffer);

    const result = await container.ingestionService.ingestDocument({
      filename,
      mimeType,
      buffer,
      ownerId: user.id,
    });

    return NextResponse.json(
      {
        documentId: result.document.id,
        versionId: result.version.id,
        jobId: result.job.id,
        status: result.document.status,
        duplicate: result.duplicate,
        name: result.document.name,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const status = error.httpStatus || (error instanceof DomainError ? error.httpStatus : 500);
    return NextResponse.json({ error: error.message || "Document ingestion failed", code: error.code || "INGESTION_ERROR" }, { status });
  }
}
