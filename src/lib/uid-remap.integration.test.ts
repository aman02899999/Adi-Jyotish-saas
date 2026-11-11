import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runRemap } from "../../scripts/remap-auth-uids.mjs";
import { collectFacts } from "../../scripts/supabase-cutover-report.mjs";

/**
 * The uid remap, forwards and backwards, against a real Postgres carrying the migration schema.
 *
 * The case that matters is the second copy. The copy writes members under their Firebase uid;
 * after a remap those rows live under a uuid, so copying again tries to insert every member a
 * second time and is refused on the unique email. Remapping backwards first is what makes a
 * rehearsal followed by a real cutover possible, and this suite fails without it.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/uid-remap.integration.test.ts
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const FB_A = "uidremapitestAAAAAAAAAAAAAAA";
const FB_B = "uidremapitestBBBBBBBBBBBBBBB";
const UUID_A = "0a000000-0000-4000-8000-00000000000a";
const UUID_B = "0b000000-0000-4000-8000-00000000000b";
const ALL_IDS = [FB_A, FB_B, UUID_A, UUID_B];
const quiet = { log: () => {} };

describeCutover("uid remap round trip", () => {
  let client: pg.Client;

  /** What the copy script does for these collections: upsert under the Firestore id. */
  async function copyFromFirestore() {
    for (const [uid, email] of [
      [FB_A, "uid-remap-a@itest.invalid"],
      [FB_B, "uid-remap-b@itest.invalid"],
    ]) {
      await client.query(
        `insert into public.members (id, name, email) values ($1, 'Remap Test', $2)
         on conflict (id) do update set name = excluded.name, email = excluded.email`,
        [uid, email],
      );
      await client.query(
        `insert into public.wallets (id, member_id) values ($1, $1)
         on conflict (id) do update set member_id = excluded.member_id`,
        [uid],
      );
      await client.query(
        `insert into public.notifications (id, recipient_type, recipient_id, type)
         values ($1, 'member', $2, 'itest')
         on conflict (id) do update set recipient_id = excluded.recipient_id`,
        [`uid-remap-itest-${uid}`, uid],
      );
    }
  }

  const ids = async (sql: string) => (await client.query(sql, [ALL_IDS])).rows.map((r) => Object.values(r).join("|")).sort();
  const state = async () => ({
    members: await ids("select id from public.members where id = any($1)"),
    wallets: await ids("select id, member_id from public.wallets where member_id = any($1)"),
    notifications: await ids("select recipient_id from public.notifications where recipient_id = any($1)"),
  });

  async function cleanup() {
    await client.query("delete from public.notifications where id like 'uid-remap-itest-%'");
    await client.query("delete from public.wallets where id = any($1)", [ALL_IDS]);
    await client.query("delete from public.members where id = any($1)", [ALL_IDS]);
    await client.query("delete from public.auth_uid_map where firebase_uid = any($1)", [[FB_A, FB_B]]);
  }

  beforeAll(async () => {
    client = new pg.Client({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: process.env.PGSSLMODE === "disable" ? undefined : { rejectUnauthorized: true },
    });
    await client.connect();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await client.end();
  });

  it("backwards is a no-op before any login has been copied", async () => {
    const { rows } = await client.query("select count(*)::int as n from public.auth_uid_map");
    // Only meaningful on a database nothing else has mapped; CI's is one.
    if (rows[0].n === 0) await expect(runRemap(client, { reverse: true, ...quiet })).resolves.toBe("skipped");
  });

  it("forwards moves every uid-bearing column to the uuid", async () => {
    await copyFromFirestore();
    await client.query(
      "insert into public.auth_uid_map (firebase_uid, supabase_uid, email) values ($1, $2, 'uid-remap-a@itest.invalid'), ($3, $4, 'uid-remap-b@itest.invalid')",
      [FB_A, UUID_A, FB_B, UUID_B],
    );
    await expect(runRemap(client, quiet)).resolves.toBe("remapped");
    expect(await state()).toEqual({
      members: [UUID_A, UUID_B],
      wallets: [`${UUID_A}|${UUID_A}`, `${UUID_B}|${UUID_B}`],
      notifications: [UUID_A, UUID_B],
    });
  });

  it("copying again without going backwards first is what breaks", async () => {
    // The renamed row still holds the member's email, so the copy's insert under the old
    // Firebase id collides with it and the whole members batch is refused.
    await expect(copyFromFirestore()).rejects.toThrow(/members_email_key/);
    expect((await state()).members).toEqual([UUID_A, UUID_B]);
  });

  it("backwards restores exactly the ids the copy writes", async () => {
    await expect(runRemap(client, { reverse: true, ...quiet })).resolves.toBe("reversed");
    expect(await state()).toEqual({
      members: [FB_A, FB_B].sort(),
      wallets: [`${FB_A}|${FB_A}`, `${FB_B}|${FB_B}`].sort(),
      notifications: [FB_A, FB_B].sort(),
    });
  });

  it("backwards, copy, forwards leaves one row per member", async () => {
    await copyFromFirestore();
    await expect(runRemap(client, quiet)).resolves.toBe("remapped");
    expect(await state()).toEqual({
      members: [UUID_A, UUID_B],
      wallets: [`${UUID_A}|${UUID_A}`, `${UUID_B}|${UUID_B}`],
      notifications: [UUID_A, UUID_B],
    });
  });

  it("leaves the foreign keys exactly as the migrations declared them", async () => {
    const { rows } = await client.query(
      `select count(*)::int as n from pg_constraint con
        where con.contype = 'f' and con.confupdtype <> 'a'
          and con.confrelid in ('public.members'::regclass, 'public.wallets'::regclass,
                                'public.admin_users'::regclass, 'public.member_subscriptions'::regclass)`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("the health report counts a member still on a Firebase id", async () => {
    await runRemap(client, { reverse: true, ...quiet });
    const before = await collectFacts(client);
    expect(before.membersStillOnFirebaseId).toBeGreaterThanOrEqual(2);
    await runRemap(client, quiet);
    const after = await collectFacts(client);
    expect(after.membersStillOnFirebaseId).toBe(before.membersStillOnFirebaseId - 2);
    expect(after.rlsOff).toEqual([]);
  });
});
