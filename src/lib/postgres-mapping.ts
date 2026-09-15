/**
 * camelCase ↔ snake_case mapping between Firestore document shapes and the
 * Postgres schema in supabase/migrations/.
 *
 * This is the single source of truth for the convention. The copy scripts in
 * scripts/ implement the same rule independently (they are plain .mjs and cannot
 * import from src/), so if you change camelToSnake here you must change it there
 * too — the migration tests in postgres-mapping.test.ts are what catch drift.
 *
 * Why the mapping exists at all: Firestore documents are camelCase and every
 * TypeScript model in src/lib/ is written that way. The Postgres schema is
 * snake_case because that is what the rest of the tooling expects. Doing the
 * translation in one tested place beats doing it in ninety modules.
 */

/**
 * Firestore field name → Postgres column name.
 *
 * Deliberately the naive "underscore before every capital": it is exactly what
 * scripts/migrate-firestore-to-supabase.mjs does, so a document copied into the
 * database is readable by this function without a lookup table. It does not try
 * to be clever about runs of capitals (`gstinURL` → `gstin_u_r_l`); no field in
 * the schema has that shape, and a lookup table would be a second thing to keep
 * in sync.
 */
export function camelToSnake(field: string): string {
  return field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Postgres column name → Firestore field name. Inverse of camelToSnake for every column in the schema. */
export function snakeToCamel(column: string): string {
  return column.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Coerce a value that Postgres returned as a string back into a number.
 *
 * node-postgres returns `numeric`/`decimal` columns as STRINGS, not numbers —
 * by design, because a JS double cannot hold every numeric exactly. Every money
 * column in this schema is numeric(14,2), so without this a `price` of 499.00
 * arrives as "499.00" and every arithmetic site silently concatenates instead of
 * adding. Returns null for null/undefined, and NaN only for genuinely
 * non-numeric input, which callers should treat as a data error.
 */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return Number(trimmed);
}

/**
 * Rename a Postgres row's keys into the camelCase shape the app's models use.
 *
 * `numericColumns` is an EXPLICIT list, not a guess. Auto-detecting "looks like
 * a number" would be wrong here: shipping_pincode is "400001" and must stay a
 * string, weight_carat is a display string like "5.25 ratti", and birth_time is
 * free text. Only the columns the caller names are coerced.
 */
export function rowToCamel<T extends object>(row: Record<string, unknown>, numericColumns: readonly string[] = []): T {
  const numeric = new Set(numericColumns.map(camelToSnake));
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    out[snakeToCamel(column)] = numeric.has(column) ? toNumber(value) : value;
  }
  return out as T;
}

/** The reverse: take an app-shaped object and produce column-keyed values for an INSERT/UPDATE. */
export function payloadToSnake(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    out[camelToSnake(field)] = value;
  }
  return out;
}

/**
 * Builds the `insert ... on conflict (pk) do update` statement used by the
 * ported write paths, returning SQL plus the ordered parameter array.
 *
 * Parameterised rather than string-interpolated: every value here ultimately
 * originates from a member-controlled form or a Razorpay webhook payload.
 * Identifiers come from the schema, not from user input, but they are still
 * quoted so a column named like a keyword cannot break the statement.
 */
export function buildUpsert(
  table: string,
  row: Record<string, unknown>,
  primaryKey = "id",
): { sql: string; values: unknown[] } {
  const columns = Object.keys(row);
  if (columns.length === 0) throw new Error(`buildUpsert: empty row for ${table}`);
  if (!columns.includes(primaryKey)) throw new Error(`buildUpsert: row for ${table} is missing primary key "${primaryKey}"`);

  const values = columns.map((c) => row[c]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const updates = columns.filter((c) => c !== primaryKey);

  const sql =
    `insert into public."${table}" (${columns.map((c) => `"${c}"`).join(", ")}) ` +
    `values (${placeholders.join(", ")}) ` +
    `on conflict ("${primaryKey}") do update set ` +
    (updates.length ? updates.map((c) => `"${c}" = excluded."${c}"`).join(", ") : `"${primaryKey}" = excluded."${primaryKey}"`);

  return { sql, values };
}
