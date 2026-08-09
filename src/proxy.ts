import { NextResponse, type NextRequest } from "next/server";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(request: NextRequest) {
  // Both exemptions authenticate themselves independently of cookies (HMAC signature for the
  // webhook, a bearer secret for the cron route), so there's no ambient browser credential for
  // CSRF to forge in the first place — the Origin/sec-fetch-site check below only makes sense for
  // routes that trust the session cookie.
  if (!unsafeMethods.has(request.method) || request.nextUrl.pathname === "/api/webhooks/razorpay" || request.nextUrl.pathname === "/api/cron/housekeeping") {
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
  matcher: "/api/:path*",
};
