import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";
import { requireAuth } from "@/infrastructure/auth/auth-guard";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(req);
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
    return NextResponse.json({ error: error.message }, { status: error.httpStatus || 500 });
  }
}
