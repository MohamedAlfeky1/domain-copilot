import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/infrastructure/auth/auth-guard";
import { getAIRuntimeMetadata } from "@/infrastructure/ai/ai-provider.factory";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const metadata = getAIRuntimeMetadata();
    return NextResponse.json({
      aiProvider: metadata.provider,
      completionModel: metadata.completionModel,
      embeddingProvider: metadata.embeddingProvider,
      embeddingModel: metadata.embeddingModel,
      stepTimeoutMs: metadata.stepTimeoutMs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to resolve runtime configuration." },
      { status: error.httpStatus || 500 }
    );
  }
}
