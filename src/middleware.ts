import { NextRequest, NextResponse } from "next/server";
import { checkPersistentRateLimit } from "./lib/security/persistent-rate-limit";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function buildSecurityHeaders(options: {
  pathname: string;
  nonce: string;
  gamesDomainUrl: string;
  cdnBaseUrl: string;
  s3Endpoint?: string;
}): Record<string, string> {
  const isAdminPath =
    options.pathname.startsWith("/admin") ||
    options.pathname.startsWith("/api/admin");
  const isSearchPath = options.pathname.startsWith("/search");

  const gamesOrigin = new URL(options.gamesDomainUrl).origin;
  const cdnOrigin = new URL(options.cdnBaseUrl).origin;
  const connectOrigins = ["'self'", cdnOrigin];
  if (options.s3Endpoint) {
    try {
      connectOrigins.push(new URL(options.s3Endpoint).origin);
    } catch {}
  }

  const frameAncestors = isAdminPath ? "'none'" : "'self'";

  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${cdnOrigin}`,
    "font-src 'self'",
    `connect-src ${Array.from(new Set(connectOrigins)).join(" ")}`,
    `frame-src ${gamesOrigin}`,
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  const headers: Record<string, string> = {
    "Content-Security-Policy": cspDirectives.join("; "),
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)",
    "x-nonce": options.nonce,
  };

  if (isAdminPath || isSearchPath) {
    headers["X-Robots-Tag"] = "noindex, nofollow";
  }

  return headers;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

  if (pathname.startsWith("/api/")) {
    const rateConfig = pathname.startsWith("/api/admin/auth/login")
      ? { windowMs: 15 * 60 * 1000, maxRequests: 10 }
      : pathname.startsWith("/api/admin/uploads")
        ? { windowMs: 60 * 1000, maxRequests: 120 }
        : pathname.startsWith("/api/admin")
          ? { windowMs: 60 * 1000, maxRequests: 60 }
          : { windowMs: 60 * 1000, maxRequests: 30 };

    const rate = await checkPersistentRateLimit(`${ip}:${pathname}`, rateConfig);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }
  }

  if (pathname.startsWith("/api/") && STATE_CHANGING_METHODS.has(method)) {
    const origin = request.headers.get("origin");
    const allowedList = (
      process.env.ALLOWED_ORIGINS ??
      process.env.MAIN_DOMAIN_URL ??
      "http://localhost:3000"
    )
      .split(",")
      .map((o) => o.trim());

    if (!origin || !allowedList.includes(origin)) {
      return NextResponse.json(
        { error: "CSRF protection: forbidden or missing Origin header." },
        { status: 403 }
      );
    }
  }

  const isProtectedAdminRoute =
    (pathname.startsWith("/admin") && pathname !== "/admin/login") ||
    (pathname.startsWith("/api/admin") && pathname !== "/api/admin/auth/login");

  if (isProtectedAdminRoute) {
    const hasSessionCookie = request.cookies.has("rgames_admin_session");
    if (!hasSessionCookie) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const secHeaders = buildSecurityHeaders({
    pathname,
    nonce,
    gamesDomainUrl: process.env.GAMES_DOMAIN_URL ?? "http://localhost:3001",
    cdnBaseUrl:
      process.env.PUBLIC_CDN_BASE_URL ?? "http://localhost:9000/rgames-media",
    s3Endpoint: process.env.S3_ENDPOINT,
  });

  for (const [key, value] of Object.entries(secHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
