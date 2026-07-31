import "server-only";

/**
 * In-memory sliding-window-by-bucket rate limiter.
 *
 * This used to be backed by a `rate_limit_buckets` Postgres table. Migrating that table 1:1 to
 * Firestore would mean a read + a write on every rate-limited request (logins, AI reading
 * creation, horoscope reads, ...) purely to throttle abuse — real latency and cost for a
 * best-effort control. Cloud Run instances are typically long-lived under sustained traffic (the
 * scenario rate limiting actually matters for), so an in-memory Map is the pragmatic choice here:
 * it's free, and a cold start or scale-to-zero simply resets the window, which is an acceptable
 * trade-off for abuse throttling (unlike, say, financial holds). The one thing this does NOT do
 * that a shared store would: coordinate limits across multiple concurrently running instances —
 * fine for this app's traffic profile, but worth knowing if that ever changes.
 */

type Bucket = { windowStartedAt: number; count: number };

const buckets = new Map<string, Bucket>();

// Periodically forget stale buckets so this map doesn't grow unbounded over a long-lived instance.
const MAX_BUCKET_AGE_MS = 60 * 60 * 1000;
let lastSweep = Date.now();
function sweepIfDue() {
  const now = Date.now();
  if (now - lastSweep < MAX_BUCKET_AGE_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStartedAt > MAX_BUCKET_AGE_MS) buckets.delete(key);
  }
}

export function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export async function checkRateLimit(action: string, identifier: string, limit: number, windowSeconds: number) {
  sweepIfDue();
  const key = `${action}:${identifier}`;
  const windowMs = windowSeconds * 1000;
  const now = Date.now();

  const entry = buckets.get(key);
  if (!entry || now - entry.windowStartedAt >= windowMs) {
    buckets.set(key, { windowStartedAt: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((entry.windowStartedAt + windowMs - now) / 1000));
    return { allowed: false, retryAfter };
  }

  entry.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function rateLimitResponse(retryAfter: number) {
  return Response.json({ error: "Too many requests. Please slow down and try again shortly." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}
