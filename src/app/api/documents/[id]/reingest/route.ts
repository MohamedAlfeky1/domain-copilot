import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { localStagingStorage } from "@/infrastructure/storage/local-staging.adapter";
import { requireRole } from "@/infrastructure/auth/auth-guard";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(req, ["ADMIN", "APPROVER"]);
    const doc = await container.db.getDocumentById(params.id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const originalBytes = await localStagingStorage.retrieve(doc.contentHash);
    if (!originalBytes) {
      return NextResponse.json(
        { error: "Original upload is unavailable for a safe retry. Re-upload the document to retry ingestion." },
        { status: 409 }
      );
    }

    const result = await container.ingestionService.ingestDocument({
      filename: doc.name,
      mimeType: doc.mimeType,
      buffer: originalBytes,
      source: doc.source,
    });

    return NextResponse.json({
      message: result.duplicate ? "No re-ingestion required: identical indexed content already exists" : "Re-ingestion completed",
      documentId: result.document.id,
      versionId: result.version.id,
      status: result.document.status,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.httpStatus || 500 });
  }
}
