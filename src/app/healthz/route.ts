import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "UP",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
