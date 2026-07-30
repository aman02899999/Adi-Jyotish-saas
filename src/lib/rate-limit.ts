import "server-only";

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitBuckets } from "@/db/schema";

export function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/** Generic sliding-window-by-bucket rate limit, backed by rate_limit_buckets. Safe under concurrent requests via a per-bucket advisory lock. */
export async function checkRateLimit(action: string, identifier: string, limit: number, windowSeconds: number) {
  const bucketKey = createHash("sha256").update(`${action}:${identifier}`).digest("hex").slice(0, 64);
  const windowMs = windowSeconds * 1000;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${bucketKey}))`);
    const [entry] = await tx.select().from(rateLimitBuckets).where(eq(rateLimitBuckets.bucketKey, bucketKey)).limit(1);
    const now = new Date();

    if (!entry || now.getTime() - entry.windowStartedAt.getTime() >= windowMs) {
      await tx.insert(rateLimitBuckets).values({ bucketKey, windowStartedAt: now, count: 1, updatedAt: now })
        .onConflictDoUpdate({ target: rateLimitBuckets.bucketKey, set: { windowStartedAt: now, count: 1, updatedAt: now } });
      return { allowed: true, retryAfter: 0 };
    }

    if (entry.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.windowStartedAt.getTime() + windowMs - now.getTime()) / 1000));
      return { allowed: false, retryAfter };
    }

    await tx.update(rateLimitBuckets).set({ count: entry.count + 1, updatedAt: now }).where(eq(rateLimitBuckets.bucketKey, bucketKey));
    return { allowed: true, retryAfter: 0 };
  });
}

export function rateLimitResponse(retryAfter: number) {
  return Response.json({ error: "Too many requests. Please slow down and try again shortly." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}
