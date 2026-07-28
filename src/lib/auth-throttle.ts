import "server-only";

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { authRateLimits } from "@/db/schema";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function throttleKey(scope: string, identifier: string, request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${scope}:${identifier.trim().toLowerCase()}:${address}`).digest("hex");
}

export async function checkAuthThrottle(scope: string, identifier: string, request: Request) {
  const keyHash = throttleKey(scope, identifier, request);
  const [entry] = await db.select().from(authRateLimits).where(eq(authRateLimits.keyHash, keyHash)).limit(1);
  const now = new Date();
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.blockedUntil.getTime() - now.getTime()) / 1000)), keyHash };
  }
  return { allowed: true, retryAfter: 0, keyHash };
}

export async function recordAuthFailure(keyHash: string) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${keyHash}))`);
    const [entry] = await tx.select().from(authRateLimits).where(eq(authRateLimits.keyHash, keyHash)).limit(1);
    if (!entry || now.getTime() - entry.windowStartedAt.getTime() >= WINDOW_MS) {
      await tx.insert(authRateLimits).values({ keyHash, failures: 1, windowStartedAt: now, blockedUntil: null, updatedAt: now }).onConflictDoUpdate({ target: authRateLimits.keyHash, set: { failures: 1, windowStartedAt: now, blockedUntil: null, updatedAt: now } });
      return;
    }
    const failures = entry.failures + 1;
    await tx.update(authRateLimits).set({ failures, blockedUntil: failures >= MAX_FAILURES ? new Date(now.getTime() + WINDOW_MS) : null, updatedAt: now }).where(eq(authRateLimits.keyHash, keyHash));
  });
}

export async function clearAuthFailures(keyHash: string) {
  await db.delete(authRateLimits).where(eq(authRateLimits.keyHash, keyHash));
}
