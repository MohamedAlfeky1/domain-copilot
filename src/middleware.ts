/**
 * DOMAIN COPILOT - CORRELATION ID & OWASP SECURITY MIDDLEWARE (OBS-001 & DEV-008)
 * 1. Assigns or propagates x-correlation-id across all requests.
 * 2. Injects OWASP Top 10 security headers (CSP, HSTS, X-Frame-Options, Nosniff).
 * 3. Enforces secure CORS boundaries.
 * 4. Enforces route-level authentication guards for protected pages.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { extractAuthToken, verifyAuthToken } from "./infrastructure/auth/tokens";

const PROTECTED_PAGE_PREFIXES = [
  "/dashboard",
  "/corpus",
  "/copilot",
  "/reviews",
  "/runs",
  "/evaluation",
  "/settings",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = extractAuthToken(req);
  const isAuthenticated = Boolean(token && (await verifyAuthToken(token)));

  // 1. Root route: / -> /dashboard if authenticated, else /login
  if (pathname === "/") {
    const target = isAuthenticated ? "/dashboard" : "/login";
    return NextResponse.redirect(new URL(target, req.url));
  }

  // 2. /login route: if already authenticated, redirect to /dashboard
  if (pathname === "/login") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // 3. Protected page guard: redirect unauthenticated users to /login
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtectedPage && !isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Correlation ID Propagation (OBS-001)
  const incomingCorrelationId = req.headers.get("x-correlation-id");
  const correlationId = incomingCorrelationId && incomingCorrelationId.trim().length > 0
    ? incomingCorrelationId.trim()
    : uuidv4();

  // Clone request headers to forward correlation ID and pathname downstream
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-correlation-id", correlationId);
  requestHeaders.set("x-pathname", pathname);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const preflightHeaders = new Headers();
    preflightHeaders.set("Access-Control-Allow-Origin", "*");
    preflightHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    preflightHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-correlation-id");
    preflightHeaders.set("Access-Control-Max-Age", "86400");
    preflightHeaders.set("x-correlation-id", correlationId);
    return new NextResponse(null, { status: 204, headers: preflightHeaders });
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // 5. Correlation ID in response headers
  response.headers.set("x-correlation-id", correlationId);

  // 6. OWASP Security Headers (DEV-008)
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  // Content Security Policy
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", cspHeader);

  // CORS headers
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-correlation-id");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
