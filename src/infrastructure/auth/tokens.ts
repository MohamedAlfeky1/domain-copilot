import { NextRequest } from "next/server";
import { User } from "../../core/domain/types";

export const SESSION_TTL_SECONDS = 60 * 60 * 24;

export interface AuthSessionPayload {
  id: string;
  issuedAt: number;
  expiresAt: number;
}

export function sessionSecret(): string {
  return process.env.JWT_SECRET || "domain-copilot-assessment-secure-jwt-key-32-chars";
}

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url: string): string {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return base64;
}

export async function sign(encodedPayload: string): Promise<string> {
  const encoder = new TextEncoder();
  const secret = sessionSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload));
  const bytes = new Uint8Array(sigBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return toBase64Url(btoa(binary));
}

export async function issueAuthToken(user: Pick<User, "id">): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jsonStr = JSON.stringify({
    id: user.id,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
  });
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const encodedPayload = toBase64Url(btoa(binary));
  const signature = await sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function publicUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function extractAuthToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();

  const cookieVal = req.cookies.get("dc_token")?.value;
  if (cookieVal) return cookieVal.trim();

  const rawCookieHeader = req.headers.get("cookie");
  if (rawCookieHeader) {
    const match = rawCookieHeader.match(/(?:^|;\s*)dc_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]).trim();
  }

  return null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyAuthToken(token: string): Promise<AuthSessionPayload | null> {
  try {
    const [encodedPayload, signature, ...rest] = token.split(".");
    if (!encodedPayload || !signature || rest.length > 0) return null;

    const expectedSignature = await sign(encodedPayload);
    if (!safeEqual(signature, expectedSignature)) return null;

    const binary = atob(fromBase64Url(encodedPayload));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const jsonStr = new TextDecoder().decode(bytes);
    const payload = JSON.parse(jsonStr);
    if (!payload?.id || !Number.isInteger(payload.issuedAt) || !Number.isInteger(payload.expiresAt)) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.issuedAt > now + 60 || payload.expiresAt <= now) return null;

    return payload as AuthSessionPayload;
  } catch {
    return null;
  }
}
