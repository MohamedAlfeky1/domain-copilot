import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const doc = await container.db.getDocumentById(params.id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const version = doc.currentVersionId
      ? await container.db.getActiveVersion(doc.id)
      : null;

    const chunks = version
      ? await container.db.getChunksByVersion(version.id)
      : [];

    return NextResponse.json({
      document: doc,
      activeVersion: version,
      chunks,
      chunkCount: chunks.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
