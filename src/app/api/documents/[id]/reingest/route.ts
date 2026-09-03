import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const doc = await container.db.getDocumentById(params.id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const version = await container.db.getActiveVersion(doc.id);
    if (!version) {
      return NextResponse.json({ error: "Active version not found" }, { status: 404 });
    }

    const chunks = await container.db.getChunksByVersion(version.id);
    const reconstructedContent = chunks.map((c) => c.text).join("\n\n");

    const result = await container.ingestionService.ingestDocument({
      filename: doc.name,
      mimeType: doc.mimeType,
      buffer: Buffer.from(reconstructedContent, "utf-8"),
    });

    return NextResponse.json({
      message: "Idempotent re-ingestion completed",
      documentId: result.document.id,
      versionId: result.version.id,
      status: result.document.status,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
