import { NextRequest } from "next/server";
import { container } from "../../core/application/container";
import { ApprovalRequest, Document, Run, User, UserRole } from "../../core/domain/types";
import { ForbiddenError, UnauthorizedError } from "../../core/domain/errors";
import {
  SESSION_TTL_SECONDS,
  AuthSessionPayload,
  issueAuthToken,
  publicUser,
  extractAuthToken,
  verifyAuthToken,
  sessionSecret,
  sign,
} from "./tokens";

export {
  SESSION_TTL_SECONDS,
  type AuthSessionPayload,
  issueAuthToken,
  publicUser,
  extractAuthToken,
  verifyAuthToken,
  sessionSecret,
  sign,
};

const ROLE_VALUES: UserRole[] = ["ADMIN", "APPROVER", "EXPERT", "VIEWER"];

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
  const payload = await verifyAuthToken(token);
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

export function canAccessRun(
  user: User,
  run: Run,
  approval?: ApprovalRequest | ApprovalRequest[] | null
): boolean {
  if (user.role === "ADMIN" || run.ownerId === user.id) {
    return true;
  }
  if (user.role === "APPROVER") {
    if (Array.isArray(approval)) {
      return approval.some((a) => a && a.runId === run.id);
    }
    if (approval && approval.runId === run.id) {
      return true;
    }
  }
  return false;
}

export function requireRunAccess(
  user: User,
  run: Run,
  approval?: ApprovalRequest | ApprovalRequest[] | null
): void {
  if (!canAccessRun(user, run, approval)) {
    throw new ForbiddenError("You do not have access to this run.");
  }
}

export function canManageDocument(user: User, document: Document): boolean {
  return user.role === "ADMIN" || user.role === "APPROVER" || document.ownerId === user.id;
}

export function requireDocumentManagementAccess(user: User, document: Document): void {
  if (!canManageDocument(user, document)) {
    throw new ForbiddenError("You do not have permission to modify this document.");
  }
}
