import { createHash, timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;

/**
 * Constant-time check of a presented secret. Both sides are hashed first, so neither the
 * length nor the content leaks through timing. An empty or missing value never matches.
 */
export function tokenMatches(presented: string | null | undefined, expected: string | null | undefined): boolean {
  if (!presented || !expected) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Is this the scheduler (Vercel Cron sends "Authorization: Bearer $CRON_SECRET")?
 * Without CRON_SECRET it refuses in production. In local development it lets the call through
 * so the jobs can be run by hand, unless allowUnsetInDev is false (routes where the admin is the
 * other way in, so the cron branch should simply never pass).
 */
export function cronAuthorized(req: Request, env: Env = process.env, { allowUnsetInDev = true } = {}): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return allowUnsetInDev && env.NODE_ENV !== "production";
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") && tokenMatches(header.slice("Bearer ".length), secret);
}
