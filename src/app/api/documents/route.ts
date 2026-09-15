import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function GET() {
  try {
    const docs = await container.db.listDocuments();
    const totalChunks = await container.db.countTotalChunks();
    return NextResponse.json({
      documents: docs,
      totalCount: docs.length,
      totalChunksIndexed: totalChunks,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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
      mimeType = file.type || "application/octet-stream";

      // File type check
      const validExtensions = [".pdf", ".docx", ".txt", ".md"];
      const hasValidExt = validExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
      if (!hasValidExt && !mimeType.includes("text") && !mimeType.includes("pdf")) {
        return NextResponse.json(
          { error: `Unsupported file type: ${filename}. Supported: PDF, DOCX, TXT, MD.` },
          { status: 400 }
        );
      }

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

    // Size limit: 25MB (ING-001)
    if (buffer.length > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds 25MB maximum size limit" }, { status: 400 });
    }

    const result = await container.ingestionService.ingestDocument({
      filename,
      mimeType,
      buffer,
    });

    return NextResponse.json(
      {
        documentId: result.document.id,
        versionId: result.version.id,
        jobId: result.job.id,
        status: result.document.status,
        name: result.document.name,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
