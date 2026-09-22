import "server-only";

import { Pool, type PoolConfig, type QueryResultRow } from "pg";

import { rowToCamel } from "@/lib/postgres-mapping";
import { getSupabaseConfig } from "@/lib/supabase-config";

/**
 * Server-side Postgres client for the Supabase data layer.
 *
 * Deliberately mirrors the shape of src/lib/firestore.ts: one lazily created
 * singleton per runtime, held on globalThis so Next.js hot reloads and
 * serverless reuse do not open a new pool per request. Importing this module
 * never connects and never throws — an unconfigured environment gets a normal
 * error at the first query instead of a build-time crash, so pages that do not
 * touch Postgres keep rendering during the migration window.
 *
 * Server-side only. The service_role connection string bypasses RLS entirely;
 * this module must never be reachable from a client bundle.
 */

const globalForPg = globalThis as typeof globalThis & {
  __supabasePool?: Pool;
};

export class SupabaseNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseNotConfiguredError";
  }
}

function poolConfig(): PoolConfig {
  const config = getSupabaseConfig();
  if (!config) {
    throw new SupabaseNotConfiguredError(
      "SUPABASE_URL / SUPABASE_DB_URL are not set to usable values; Postgres-backed features are unavailable.",
    );
  }
  // Supabase requires TLS to the pooled endpoint; its certificate chain is not in
  // the default trust store on every runtime, so verification is relaxed the same
  // way the migration scripts do it. The password still travels over TLS.
  //
  // PGSSLMODE=disable (the libpq convention) turns TLS off entirely. That exists
  // for a local Postgres in development and for the integration test, neither of
  // which serves a certificate. Never set it against a real Supabase endpoint.
  const sslDisabled = process.env.PGSSLMODE?.trim().toLowerCase() === "disable";

  return {
    connectionString: config.connectionString,
    ...(sslDisabled ? {} : { ssl: { rejectUnauthorized: false } }),
    // Serverless runtimes recycle containers aggressively. A short idle timeout
    // returns connections before Supabase's own proxy drops them, which is what
    // produces "Connection terminated unexpectedly" on the next request.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

/** The shared pool. Created on first use, never at import time. */
export function getPgPool(): Pool {
  if (!globalForPg.__supabasePool) {
    globalForPg.__supabasePool = new Pool(poolConfig());
    // A pool emits 'error' for idle-client failures; an unhandled one crashes the
    // process. Log and keep serving — the next query gets a fresh client.
    globalForPg.__supabasePool.on("error", (error: Error) => {
      console.error("[supabase] idle Postgres client error", error);
    });
  }
  return globalForPg.__supabasePool;
}

/** Run a parameterised query and return raw rows (snake_case keys, untyped numerics). */
export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: readonly unknown[] = []) {
  const result = await getPgPool().query<T>(sql, params as unknown[]);
  return result;
}

/**
 * Run a query and map the rows into an app-shaped model.
 *
 * `numericColumns` must name every numeric() column the caller reads — see
 * rowToCamel for why this is explicit rather than inferred.
 */
export async function queryModels<T extends object>(
  sql: string,
  params: readonly unknown[] = [],
  numericColumns: readonly string[] = [],
): Promise<T[]> {
  const result = await getPgPool().query(sql, params as unknown[]);
  return result.rows.map((row) => rowToCamel<T>(row as Record<string, unknown>, numericColumns));
}

/** First row as a model, or null. For the many single-document lookups the app does. */
export async function queryModel<T extends object>(
  sql: string,
  params: readonly unknown[] = [],
  numericColumns: readonly string[] = [],
): Promise<T | null> {
  const rows = await queryModels<T>(sql, params, numericColumns);
  return rows[0] ?? null;
}

/**
 * Run `work` inside a transaction. The wallet ledger and the booking slot check
 * both depend on atomicity that Firestore previously provided via
 * runTransaction; this is the Postgres equivalent.
 */
export async function withTransaction<T>(work: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * True when the error is a unique-constraint violation (SQLSTATE 23505).
 *
 * Three tables enforce concurrency by row existence — chat_active_locks,
 * razorpay_events and gemstone_coupon_customer_usage — and their Firestore code
 * catches an already-exists error to mean "someone else won the race". Postgres
 * reports the same outcome as 23505, so every ported call site needs this.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23505";
}

/** Foreign-key violation (23503) — surfaces when a referenced member or product has been deleted. */
export function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23503";
}

/** Close the pool. Call from a shutdown hook; safe to call when nothing was opened. */
export async function closePgPool(): Promise<void> {
  const pool = globalForPg.__supabasePool;
  if (!pool) return;
  globalForPg.__supabasePool = undefined;
  await pool.end();
}
