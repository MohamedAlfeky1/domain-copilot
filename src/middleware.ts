/**
 * DOMAIN COPILOT - CORRELATION ID & OWASP SECURITY MIDDLEWARE (OBS-001 & DEV-008)
 * 1. Assigns or propagates x-correlation-id across all requests.
 * 2. Injects OWASP Top 10 security headers (CSP, HSTS, X-Frame-Options, Nosniff).
 * 3. Enforces secure CORS boundaries.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export function middleware(req: NextRequest) {
  // 1. Correlation ID Propagation (OBS-001)
  const incomingCorrelationId = req.headers.get("x-correlation-id");
  const correlationId = incomingCorrelationId && incomingCorrelationId.trim().length > 0
    ? incomingCorrelationId.trim()
    : uuidv4();

  // Clone request headers to forward correlation ID downstream
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-correlation-id", correlationId);

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

  // 2. Correlation ID in response headers
  response.headers.set("x-correlation-id", correlationId);

  // 3. OWASP Security Headers (DEV-008)
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
