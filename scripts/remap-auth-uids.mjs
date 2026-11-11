// Runs scripts/rewrite-auth-uids.sql, forwards or backwards.
//
// WHY BACKWARDS EXISTS. The data copy writes every row under its Firestore id, and for
// members that id is the Firebase uid. The remap then renames members to their new Supabase
// uuid. Copy a second time after that — which the runbook asks for, once as a rehearsal and
// once at the real cutover — and the upsert no longer finds the renamed row, so it tries to
// insert every member again under the old uid. The renamed row still holds that member's
// email, the insert is refused on the unique email, and the members batch aborts: in the
// middle of the cutover, with writes frozen. (Where an email had changed in between, the
// insert succeeds instead and the next remap dies on a duplicate key.)
//
// So a repeat copy is: remap backwards (uuids → Firebase uids, restoring exactly the ids the
// copy writes), copy, remap forwards. Backwards is the same SQL with the two map columns
// swapped, generated here rather than kept as a second 230-line file that could drift.
//
// Usage:
//   SUPABASE_DB_URL=… node scripts/remap-auth-uids.mjs            # forwards
//   SUPABASE_DB_URL=… node scripts/remap-auth-uids.mjs --reverse  # backwards
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const SQL_PATH = fileURLToPath(new URL("./rewrite-auth-uids.sql", import.meta.url));

/**
 * Swaps the direction of the remap.
 *
 * Every statement in the SQL has the shape `set x = map.supabase_uid … where x = map.firebase_uid`.
 * Swapping the two references reverses it. The uid columns are text and supabase_uid is a uuid:
 * assigning a uuid to a text column casts implicitly, but comparing text to a uuid does not, so
 * the reversed comparison needs an explicit ::text.
 */
export function reverseRemapSql(sql) {
  const forwardRefs = (sql.match(/map\.supabase_uid/g) ?? []).length;
  const backRefs = (sql.match(/map\.firebase_uid/g) ?? []).length;
  if (!forwardRefs || !backRefs) throw new Error("rewrite-auth-uids.sql no longer has the shape this reversal expects");
  return sql
    .replace(/map\.supabase_uid/g, "map.__TARGET__")
    .replace(/map\.firebase_uid/g, "map.supabase_uid::text")
    .replace(/map\.__TARGET__/g, "map.firebase_uid");
}

// Same certificate-verification reasoning as src/lib/postgres.ts and the copy scripts.
export function pgSslOptions(env = process.env) {
  if (env.PGSSLMODE?.trim().toLowerCase() === "disable") return undefined;
  const ca = env.SUPABASE_CA_CERT?.trim().replace(/\\n/g, "\n");
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

/**
 * Runs the remap on an open client. Returns "skipped" when there is nothing to do.
 *
 * An empty map is an error forwards (the logins have not been copied, and the SQL refuses to
 * run) but normal backwards: before the first copy there is nothing to undo.
 */
export async function runRemap(client, { reverse = false, log = console.log } = {}) {
  const sql = readFileSync(SQL_PATH, "utf8");
  if (reverse) {
    const { rows } = await client.query("select count(*)::int as n from public.auth_uid_map");
    if (rows[0].n === 0) {
      log("No logins have been copied yet, so there are no renamed ids to restore.");
      return "skipped";
    }
  }
  try {
    await client.query(reverse ? reverseRemapSql(sql) : sql);
  } catch (error) {
    // The script opens its own transaction; make sure a failure does not leave it open.
    await client.query("rollback").catch(() => {});
    throw error;
  }
  return reverse ? "reversed" : "remapped";
}

async function main() {
  const reverse = process.argv.includes("--reverse");
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("SUPABASE_DB_URL is required.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString, ssl: pgSslOptions() });
  client.on("notice", (notice) => console.log(`  ${notice.message}`));
  await client.connect();
  try {
    const outcome = await runRemap(client, { reverse });
    console.log(reverse ? `Ids restored to their Firebase form: ${outcome}.` : `Ids moved to their Supabase form: ${outcome}.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
