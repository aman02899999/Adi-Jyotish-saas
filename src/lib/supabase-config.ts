/**
 * Configuration gate for the Firebase → Supabase migration.
 *
 * The app still runs on Firestore. This module is the switch that lets the two
 * data layers coexist: every read/write site that has been ported checks
 * `isSupabaseCutoverActive()` and takes the Postgres path when it is true, the
 * Firestore path otherwise. Nothing changes behaviour until the environment says
 * so, which is what makes the migration reversible at deploy time rather than at
 * git-revert time.
 *
 * Two separate questions, deliberately:
 *   isSupabaseConfigured()    — are the credentials present and well-formed?
 *   isSupabaseCutoverActive() — AND has an operator flipped SUPABASE_CUTOVER?
 *
 * Splitting them means credentials can be added to a deployment days ahead of the
 * cutover without changing a single code path, and the actual switch is one
 * variable. Mirrors the shape of isFirebaseConfigured() in src/lib/firestore.ts.
 *
 * Like that module, nothing here throws and no credential value is ever logged —
 * only the *category* of what is missing.
 */

export type SupabaseConfig = {
  /** Project root, e.g. https://abcdefgh.supabase.co — used for the Auth admin API. */
  url: string;
  /** Direct Postgres connection string. */
  connectionString: string;
  /** service_role key. Server-side only; bypasses RLS. */
  serviceRoleKey: string | null;
};

const CONNECTION_SCHEMES = ["postgres:", "postgresql:"];

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Validates the project URL without contacting it. Supabase's Auth admin API is
 * reached at `${url}/auth/v1/...`, so a URL with a trailing slash would produce a
 * double slash and a confusing 404 at cutover time — normalize it here instead.
 */
function normalizeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  // https only. A postgres-only deployment has no reason to serve an http API, and
  // accepting http here would let a typo silently send the service_role key in
  // cleartext.
  if (parsed.protocol !== "https:") return null;
  return parsed.origin;
}

function normalizeConnectionString(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!CONNECTION_SCHEMES.includes(parsed.protocol)) return null;
  if (!parsed.hostname) return null;
  return raw.trim();
}

/**
 * Returns the parsed configuration, or null if Supabase is not usable. Callers
 * that need to log why should use describeMissingSupabaseConfig().
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = normalizeUrl(process.env.SUPABASE_URL ?? "");
  if (!url) return null;
  const connectionString = normalizeConnectionString(process.env.SUPABASE_DB_URL ?? "");
  if (!connectionString) return null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, connectionString, serviceRoleKey: isNonEmpty(key) ? key.trim() : null };
}

/** Credentials present and well-formed. Does NOT mean traffic is being routed here. */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

/**
 * The actual routing decision. True only once credentials are valid AND an
 * operator has set SUPABASE_CUTOVER=true. Ported read/write sites branch on this.
 */
export function isSupabaseCutoverActive(): boolean {
  if (process.env.SUPABASE_CUTOVER?.trim().toLowerCase() !== "true") return false;
  return isSupabaseConfigured();
}

/**
 * Names the missing pieces without printing any of their values. Safe to put in a
 * log line during the migration window, when half-configured environments are the
 * expected normal state rather than an incident.
 */
export function describeMissingSupabaseConfig(): string {
  const missing: string[] = [];
  if (!normalizeUrl(process.env.SUPABASE_URL ?? "")) missing.push("SUPABASE_URL");
  if (!normalizeConnectionString(process.env.SUPABASE_DB_URL ?? "")) missing.push("SUPABASE_DB_URL");
  if (!isNonEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY)) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!isNonEmpty(process.env.SUPABASE_JWT_SECRET)) missing.push("SUPABASE_JWT_SECRET");
  if (missing.length === 0) return "all Supabase variables are set";
  return `missing or invalid: ${missing.join(", ")}`;
}

/** True when the service_role key is absent — Auth admin calls will fail. */
export function isSupabaseServiceRolePresent(): boolean {
  return isNonEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * True when SUPABASE_JWT_SECRET is set.
 *
 * Deliberately not folded into isSupabaseConfigured(). That gate describes the *data*
 * connection, and the migration scripts legitimately run with a database URL and nothing
 * else. This secret is what the request path needs: verifySupabaseAccessToken uses it to
 * check every access token, and app-session.ts derives the session cookie's signing key
 * from it, so without it no member, practitioner or administrator can sign in or hold a
 * session — every authenticated request fails closed.
 *
 * Folding it into the cutover gate instead would make a cutover without it silently keep
 * serving from Firebase, which is the quiet kind of failure this codebase keeps paying
 * for. So the routing decision is left alone and the gap is reported loudly: named by
 * describeMissingSupabaseConfig() and surfaced as an unavailable dependency by
 * /api/health.
 */
export function isSupabaseSessionSecretPresent(): boolean {
  return isNonEmpty(process.env.SUPABASE_JWT_SECRET);
}
