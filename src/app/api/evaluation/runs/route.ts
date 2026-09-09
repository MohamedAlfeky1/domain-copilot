import { NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function GET() {
  try {
    const results = await container.db.listEvaluationResults();
    const cases = await container.db.listEvaluationCases();

    const totalTests = results.length;
    const passed = results.filter((r) => r.pass).length;
    const passRate = totalTests > 0 ? Math.round((passed / totalTests) * 100) : 100;
    const avgLatency = totalTests > 0 ? Math.round(results.reduce((acc, r) => acc + r.latencyMs, 0) / totalTests) : 0;
    const totalCost = results.reduce((acc, r) => acc + r.totalCost, 0);

    return NextResponse.json({
      summary: {
        totalTests,
        passed,
        failed: totalTests - passed,
        passRatePct: passRate,
        averageLatencyMs: avgLatency,
        totalCostUsd: Math.round(totalCost * 100000) / 100000,
      },
      casesCount: cases.length,
      recentResults: results.slice(-20),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
