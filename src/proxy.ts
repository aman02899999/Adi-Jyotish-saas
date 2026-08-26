import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const intlMiddleware = createIntlMiddleware(routing);

export function proxy(request: NextRequest) {
  // Locale detection/redirects (e.g. bare "/astrologers" -> "/hi/astrologers" for a Hindi-
  // preferring browser) only apply to page routes — API routes have no locale concept and must
  // fall through to the CSRF check below untouched.
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return intlMiddleware(request);
  }

  // The webhook authenticates itself independently of cookies (HMAC signature), so there's no
  // ambient browser credential for CSRF to forge in the first place — the Origin/sec-fetch-site
  // check below only makes sense for routes that trust the session cookie.
  if (!unsafeMethods.has(request.method) || request.nextUrl.pathname === "/api/webhooks/razorpay") {
    return NextResponse.next();
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host");
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "");
    if (!host || origin !== `${protocol}://${host}`) {
      return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    }
  } else if (!fetchSite) {
    // Neither header present means this request's origin can't be verified at all — every
    // legitimate same-origin fetch/XHR from a modern browser sends at least one of the two, so
    // failing closed here (rather than letting an unverifiable request through) only affects
    // non-browser or very old clients, not real app traffic.
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  // "/api/:path*" for the CSRF check; the second pattern is next-intl's own recommended matcher
  // for page routes — it excludes /api, Next internals, and any path with a dotted last segment
  // (robots.txt, sitemap.xml, manifest.webmanifest, icon.png, …), which is exactly the set of
  // locale-agnostic files kept outside src/app/[locale].
  matcher: ["/api/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
