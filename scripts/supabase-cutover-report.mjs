// Read-only health report on the Supabase side of the migration.
//
// Answers, without writing anything: is the schema all there, is every table closed to the
// public API, how many rows and logins have arrived, are any ids still in their Firebase form,
// and is anybody already signing in through Supabase. Prints a table to the log and, in GitHub
// Actions, to the run's summary page, so the owner reads a page rather than a log.
//
// Usage:
//   SUPABASE_DB_URL=… node scripts/supabase-cutover-report.mjs [--guard-copy] [--after-copy]
//
//   --guard-copy  fail if anyone has signed in through Supabase. A copy overwrites Supabase
//                 with Firebase's data, which is only right while Firebase is the live store.
//                 Set ALLOW_COPY_AFTER_SIGNINS=true to override after a preview rehearsal.
//   --after-copy  fail unless the copy is complete: logins mapped, no Firebase ids left,
//                 every wallet entry carrying its balance.
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";

import { pgSslOptions } from "./remap-auth-uids.mjs";

// supabase/migrations 0001–0016 create this many tables. Fewer means a migration is missing.
export const EXPECTED_TABLES = 67;

const UUID = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

/** Gathers every fact the report needs. Read-only: the one transaction it opens is rolled back. */
export async function collectFacts(client) {
  const one = async (sql, params) => (await client.query(sql, params)).rows[0];

  const tables = (
    await client.query(
      `select c.relname as name, c.relrowsecurity as rls
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
    )
  ).rows;

  const counts = [];
  for (const table of tables) {
    const { n } = await one(`select count(*)::int as n from public."${table.name}"`);
    counts.push({ table: table.name, rows: n });
  }

  // The real question behind "is RLS on": can the public API key read anything? Ask as that
  // role. A table with rows that shows any of them to `anon` or `authenticated` is open.
  const exposed = [];
  const rolesChecked = (
    await client.query("select rolname from pg_roles where rolname in ('anon', 'authenticated') order by rolname")
  ).rows.map((r) => r.rolname);
  await client.query("begin");
  try {
    for (const role of rolesChecked) {
      await client.query(`set local role ${role}`);
      for (const { table, rows } of counts) {
        if (!rows) continue;
        try {
          const { n } = await one(`select count(*)::int as n from public."${table}"`);
          if (n > 0) exposed.push(`${table} (${role})`);
        } catch {
          // Permission denied is the other way of being closed.
          await client.query("rollback").catch(() => {});
          await client.query("begin");
          await client.query(`set local role ${role}`);
        }
      }
      await client.query("reset role");
    }
  } finally {
    await client.query("rollback").catch(() => {});
  }

  const hasAuth = (await one("select to_regclass('auth.users') is not null as ok")).ok;
  const hasStorage = (await one("select to_regclass('storage.buckets') is not null as ok")).ok;
  const auth = hasAuth
    ? await one("select count(*)::int as users, count(last_sign_in_at)::int as signed_in from auth.users")
    : { users: 0, signed_in: 0 };
  const buckets = hasStorage ? (await client.query("select id, public from storage.buckets order by id")).rows : [];
  const objects = hasStorage ? (await one("select count(*)::int as n from storage.objects")).n : 0;

  const map = await one("select count(*)::int as n from public.auth_uid_map");
  const firebaseIds = await one(
    `select (select count(*)::int from public.members m join public.auth_uid_map a on a.firebase_uid = m.id) as members,
            (select count(*)::int from public.members where id !~ $1) as non_uuid_members`,
    [UUID],
  );
  const wallet = await one(
    `select count(*)::int as n from public.wallet_entries e join public.wallets w on w.id = e.wallet_id
      where e.balance_after is null`,
  );

  return {
    tableCount: tables.length,
    rlsOff: tables.filter((t) => !t.rls).map((t) => t.name),
    exposed,
    rolesChecked,
    counts,
    totalRows: counts.reduce((sum, c) => sum + c.rows, 0),
    authUsers: auth.users,
    signedIn: auth.signed_in,
    buckets,
    objects,
    mapped: map.n,
    membersStillOnFirebaseId: firebaseIds.members,
    membersWithoutLogin: firebaseIds.non_uuid_members,
    walletEntriesMissingBalance: wallet.n,
  };
}

/** Turns the facts into pass/fail lines. Pure, so the rules are unit-tested without a database. */
export function evaluate(facts, { guardCopy = false, afterCopy = false, allowAfterSignins = false, bucket = "readings" } = {}) {
  const checks = [];
  const add = (ok, label, detail, blocking = true) => checks.push({ ok, label, detail, blocking });

  add(facts.tableCount >= EXPECTED_TABLES, "All tables exist", `${facts.tableCount} of ${EXPECTED_TABLES}`);
  add(facts.rlsOff.length === 0, "Row security is on for every table", facts.rlsOff.length ? `off on: ${facts.rlsOff.join(", ")}` : "on for all");
  // Supabase always has both roles. If neither exists this is not a Supabase database and the
  // question was never asked, which must not read as "nothing readable".
  if (!facts.rolesChecked.length) add(false, "The public API key can read no rows", "could not test: the anon and authenticated roles do not exist");
  else add(facts.exposed.length === 0, "The public API key can read no rows", facts.exposed.length ? `readable: ${facts.exposed.join(", ")}` : `nothing readable (asked as ${facts.rolesChecked.join(" and ")})`);

  const target = facts.buckets.find((b) => b.id === bucket);
  add(!target || !target.public, "Photo storage is private", target ? (target.public ? "PUBLIC" : `"${bucket}" is private`) : `"${bucket}" not created yet`);

  if (guardCopy) {
    add(
      facts.signedIn === 0 || allowAfterSignins,
      "Nobody is using Supabase logins yet (safe to overwrite it from Firebase)",
      facts.signedIn === 0 ? "no sign-ins" : `${facts.signedIn} account(s) have signed in${allowAfterSignins ? ", override given" : ""}`,
    );
  }

  if (afterCopy) {
    add(facts.totalRows > 0, "Data has arrived", `${facts.totalRows} rows`);
    add(facts.mapped > 0, "Logins were copied", `${facts.mapped} login(s) mapped, ${facts.authUsers} in Supabase`);
    add(facts.membersStillOnFirebaseId === 0, "No member is left on a Firebase id", `${facts.membersStillOnFirebaseId} left`);
    add(facts.walletEntriesMissingBalance === 0, "Every wallet entry carries its balance", `${facts.walletEntriesMissingBalance} missing`);
    add(Boolean(target), "Photo storage bucket exists", target ? `"${bucket}", ${facts.objects} file(s)` : "missing");
    // A member document with no matching login cannot sign in. Worth knowing, not a failure:
    // demo and test documents are created without an account.
    add(facts.membersWithoutLogin === 0, "Every member has a login", `${facts.membersWithoutLogin} member row(s) have no login`, false);
  }

  return { checks, ok: checks.every((c) => c.ok || !c.blocking) };
}

export function renderMarkdown(facts, verdict, title) {
  const lines = [`## ${title}`, "", `**${verdict.ok ? "PASSED" : "FAILED"}**`, "", "| Check | Result | Detail |", "|---|---|---|"];
  for (const c of verdict.checks) lines.push(`| ${c.label} | ${c.ok ? "ok" : c.blocking ? "FAILED" : "note"} | ${c.detail} |`);
  lines.push("", `Rows in Supabase: **${facts.totalRows}** across ${facts.counts.filter((c) => c.rows).length} of ${facts.tableCount} tables. Logins: **${facts.authUsers}**. Files: **${facts.objects}**.`);
  const filled = facts.counts.filter((c) => c.rows);
  if (filled.length) {
    lines.push("", "<details><summary>Rows per table</summary>", "", "| Table | Rows |", "|---|---|");
    for (const c of filled) lines.push(`| ${c.table} | ${c.rows} |`);
    lines.push("", "</details>");
  }
  return lines.join("\n");
}

/**
 * The three ways this connection fails in practice, in the owner's words. Never echoes the
 * connection string: it carries the database password.
 */
export function connectionHint(connectionString, error) {
  let host = "";
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return "SUPABASE_DB_URL is not a valid connection string. Copy it again from Supabase: Connect, then Session pooler.";
  }
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (/^db\./.test(host) && /ENETUNREACH|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH/.test(text)) {
    return "SUPABASE_DB_URL is the Direct connection, which only works over IPv6. GitHub and Vercel cannot reach it. Use the Session pooler string instead (Supabase: Connect, then Session pooler).";
  }
  if (/password authentication failed|28P01/.test(text)) {
    return "The database password inside SUPABASE_DB_URL is wrong. Replace [YOUR-PASSWORD] in the string with the real database password (Supabase: Database, Settings, Reset database password if it is lost).";
  }
  if (/certificate|self.signed|SELF_SIGNED|UNABLE_TO/i.test(text)) {
    return "The database certificate could not be verified. Check the SUPABASE_CA_CERT secret holds the whole downloaded certificate file, including the BEGIN and END lines.";
  }
  return "Check SUPABASE_DB_URL is the Session pooler string with the real password in it.";
}

async function main() {
  const guardCopy = process.argv.includes("--guard-copy");
  const afterCopy = process.argv.includes("--after-copy");
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("SUPABASE_DB_URL is required.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString, ssl: pgSslOptions() });
  try {
    await client.connect();
  } catch (error) {
    console.error(`Could not connect to the database: ${error.code ?? error.message}`);
    console.error(connectionHint(connectionString, error));
    process.exit(1);
  }
  let facts;
  try {
    facts = await collectFacts(client);
  } finally {
    await client.end();
  }
  const verdict = evaluate(facts, {
    guardCopy,
    afterCopy,
    allowAfterSignins: process.env.ALLOW_COPY_AFTER_SIGNINS === "true",
    bucket: process.env.SUPABASE_STORAGE_BUCKET?.trim() || "readings",
  });
  const title = afterCopy ? "Supabase after the copy" : guardCopy ? "Supabase before the copy" : "Supabase health check";
  const markdown = renderMarkdown(facts, verdict, title);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n\n`);
  if (!verdict.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
