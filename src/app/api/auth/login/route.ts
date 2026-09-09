import { NextRequest, NextResponse } from "next/server";
import { container } from "@/core/application/container";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, role } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    let user = await container.db.getUserByEmail(email);
    if (!user) {
      user = await container.db.createUser({
        email,
        role: role || "EXPERT",
        status: "ACTIVE",
      });
    }

    const token = `jwt-${Buffer.from(JSON.stringify({ id: user.id, email: user.email, role: user.role })).toString("base64")}`;

    const response = NextResponse.json({
      token,
      user,
    });

    response.cookies.set("dc_token", token, {
      httpOnly: true,
      path: "/",
      maxAge: 86400,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
