import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { container } from "../../core/application/container";
import { Document, Run, User, UserRole } from "../../core/domain/types";
import { ForbiddenError, UnauthorizedError } from "../../core/domain/errors";

const SESSION_TTL_SECONDS = 60 * 60 * 24;
const ROLE_VALUES: UserRole[] = ["ADMIN", "APPROVER", "EXPERT", "VIEWER"];

export interface AuthSessionPayload {
  id: string;
  issuedAt: number;
  expiresAt: number;
}

function sessionSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to a value of at least 32 characters.");
  }
  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
}

export function issueAuthToken(user: User): string {
  const now = Math.floor(Date.now() / 1000);
  const encodedPayload = Buffer.from(JSON.stringify({
    id: user.id,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
  })).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function publicUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function extractAuthToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();
  return req.cookies.get("dc_token")?.value.trim() || null;
}

export function verifyAuthToken(token: string): AuthSessionPayload | null {
  try {
    const [encodedPayload, signature, ...rest] = token.split(".");
    if (!encodedPayload || !signature || rest.length > 0) return null;
    const expectedSignature = sign(encodedPayload);
    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8"));
    if (!payload?.id || !Number.isInteger(payload.issuedAt) || !Number.isInteger(payload.expiresAt)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.issuedAt > now || payload.expiresAt <= now) return null;
    return payload as AuthSessionPayload;
  } catch {
    return null;
  }
}

async function getTestUser(req: NextRequest): Promise<User | null> {
  if (process.env.NODE_ENV !== "test" || process.env.ALLOW_TEST_AUTH !== "true") return null;
  const role = req.headers.get("x-test-role") as UserRole | null;
  const userId = req.headers.get("x-test-user-id");
  if (!role || !ROLE_VALUES.includes(role) || !userId) return null;
  const user = await container.db.getUserById(userId);
  return user?.role === role && user.status === "ACTIVE" ? user : null;
}

export async function getAuthenticatedUser(req: NextRequest): Promise<User | null> {
  const testUser = await getTestUser(req);
  if (testUser) return testUser;

  const token = extractAuthToken(req);
  if (!token) return null;
  const payload = verifyAuthToken(token);
  if (!payload) return null;

  const user = await container.db.getUserById(payload.id);
  return user?.status === "ACTIVE" ? user : null;
}

export async function requireAuth(req: NextRequest): Promise<User> {
  const user = await getAuthenticatedUser(req);
  if (!user) throw new UnauthorizedError("Authentication required.");
  return user;
}

export async function requireRole(req: NextRequest, allowedRoles: UserRole[]): Promise<User> {
  const user = await requireAuth(req);
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError("Access denied for this role.");
  }
  return user;
}

export function canAccessRun(user: User, run: Run): boolean {
  return user.role === "ADMIN" || run.ownerId === user.id;
}

export function requireRunAccess(user: User, run: Run): void {
  if (!canAccessRun(user, run)) throw new ForbiddenError("You do not have access to this run.");
}

export function canManageDocument(user: User, document: Document): boolean {
  return user.role === "ADMIN" || user.role === "APPROVER" || document.ownerId === user.id;
}

export function requireDocumentManagementAccess(user: User, document: Document): void {
  if (!canManageDocument(user, document)) {
    throw new ForbiddenError("You do not have permission to modify this document.");
  }
}
