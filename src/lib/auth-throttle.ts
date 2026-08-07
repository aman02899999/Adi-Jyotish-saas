import "server-only";

import { createHash } from "node:crypto";

// Same in-memory approach as rate-limit.ts, and for the same reasons — see the comment there.
// A restart clearing failed-login counters is an acceptable trade-off for an abuse control.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type ThrottleEntry = { failures: number; windowStartedAt: number; blockedUntil: number | null };

const entries = new Map<string, ThrottleEntry>();

function throttleKey(scope: string, identifier: string, request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${scope}:${identifier.trim().toLowerCase()}:${address}`).digest("hex");
}

export async function checkAuthThrottle(scope: string, identifier: string, request: Request) {
  const keyHash = throttleKey(scope, identifier, request);
  const entry = entries.get(keyHash);
  const now = Date.now();
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)), keyHash };
  }
  return { allowed: true, retryAfter: 0, keyHash };
}

export async function recordAuthFailure(keyHash: string) {
  const now = Date.now();
  const entry = entries.get(keyHash);
  if (!entry || now - entry.windowStartedAt >= WINDOW_MS) {
    entries.set(keyHash, { failures: 1, windowStartedAt: now, blockedUntil: null });
    return;
  }
  const failures = entry.failures + 1;
  entries.set(keyHash, { failures, windowStartedAt: entry.windowStartedAt, blockedUntil: failures >= MAX_FAILURES ? now + WINDOW_MS : null });
}

export async function clearAuthFailures(keyHash: string) {
  entries.delete(keyHash);
}
