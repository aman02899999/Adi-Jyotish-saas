import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePgPool, isForeignKeyViolation, isUniqueViolation, query, queryModel, queryModels, withTransaction } from "@/lib/postgres";
import { buildUpsert, camelToSnake, snakeToCamel } from "@/lib/postgres-mapping";

/**
 * Integration test for the Postgres client. Skipped unless SUPABASE_DB_URL points
 * at a reachable database, so CI without a database still passes — but when a
 * database IS available this exercises the real query paths, not a mock.
 *
 * Run against the migration schema:
 *   SUPABASE_DB_URL=postgresql://... npx vitest run src/lib/postgres.integration.test.ts
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

// Only this file's own rows. The original cleanup was an unscoped
// `delete from public.bookings` (and the same for services, practitioners,
// members and wallets), which wiped every other integration file's fixtures
// whenever vitest ran them in parallel — an intermittent foreign-key or
// missing-row failure in whichever file happened to be mid-test. A `like
// 'itest%'` prefix would not fix it either: chat-supabase seeds
// `itest-prac-%`, which that pattern matches.
const OWN_MEMBERS = ["itest-1", "itest-dup", "itest-orphan"];
const OWN_PRACTITIONERS = ["itest-prac"];
const OWN_SERVICES = ["itest-svc"];

async function deleteOwnRows() {
  await query(`delete from public.wallet_entries where wallet_id = any($1::text[])`, [OWN_MEMBERS]);
  await query(`delete from public.wallet_holds where wallet_id = any($1::text[])`, [OWN_MEMBERS]);
  await query(`delete from public.wallets where id = any($1::text[])`, [OWN_MEMBERS]);
  await query(`delete from public.bookings where practitioner_id = any($1::text[])`, [OWN_PRACTITIONERS]);
  await query(`delete from public.services where id = any($1::text[])`, [OWN_SERVICES]);
  await query(`delete from public.practitioners where id = any($1::text[])`, [OWN_PRACTITIONERS]);
  await query(`delete from public.members where id = any($1::text[])`, [OWN_MEMBERS]);
}

describeDb("postgres client (live database)", () => {
  beforeAll(async () => {
    await deleteOwnRows();
    await query(`insert into public.members (id, name, email) values ($1, $2, $3)`, ["itest-1", "Itest", "itest@example.com"]);
    await query(`insert into public.practitioners (id, name, slug, email) values ($1, $2, $3, $4)`, [
      "itest-prac",
      "Itest Guru",
      "itest-guru",
      "itest-guru@example.com",
    ]);
    await query(`insert into public.services (id, title, slug) values ($1, $2, $3)`, ["itest-svc", "Kundli", "kundli-itest"]);
  });

  afterAll(async () => {
    await deleteOwnRows();
    await closePgPool();
  });

  it("maps a row into the camelCase model and coerces only the named numeric column", async () => {
    await query(
      `insert into public.wallets (id, member_id, balance) values ($1, $2, $3) on conflict (id) do update set balance = excluded.balance`,
      ["itest-1", "itest-1", "499.50"],
    );
    const wallet = await queryModel<{ id: string; memberId: string; balance: number | null }>(
      `select id, member_id, balance from public.wallets where id = $1`,
      ["itest-1"],
      ["balance"],
    );
    expect(wallet).not.toBeNull();
    expect(wallet?.memberId).toBe("itest-1");
    // Without the numericColumns argument this would be the string "499.50".
    expect(wallet?.balance).toBe(499.5);
  });

  it("returns null from queryModel when there is no row", async () => {
    const row = await queryModel(`select id from public.members where id = $1`, ["does-not-exist"]);
    expect(row).toBeNull();
  });

  it("maps a list of rows", async () => {
    const rows = await queryModels<{ id: string; memberId: string }>(`select id, member_id from public.wallets where id = $1`, ["itest-1"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.memberId).toBe("itest-1");
  });

  it("inserts through buildUpsert with bound parameters", async () => {
    const { sql, values } = buildUpsert("bookings", {
      id: "itest-b1",
      reference: "JY-ITEST-1",
      member_id: "itest-1",
      service_id: "itest-svc",
      service_title: "Kundli",
      practitioner_id: "itest-prac",
      practitioner_name: "Itest Guru",
      client_name: "Itest",
      client_email: "itest@example.com",
      scheduled_at: new Date().toISOString(),
    });
    const result = await query(sql, values);
    expect(result.rowCount).toBe(1);
  });

  it("reports a unique violation as 23505 via isUniqueViolation", async () => {
    const { sql, values } = buildUpsert("members", { id: "itest-dup", name: "A", email: "a@example.com" });
    await query(sql, values);
    try {
      // Deliberately bypass the upsert to force a bare duplicate insert.
      await query(`insert into public.members (id, name, email) values ($1, $2, $3)`, ["itest-dup", "B", "b@example.com"]);
      throw new Error("expected a unique violation");
    } catch (error) {
      if (error instanceof Error && error.message === "expected a unique violation") throw error;
      expect(isUniqueViolation(error)).toBe(true);
      expect(isForeignKeyViolation(error)).toBe(false);
    }
    await query(`delete from public.members where id = $1`, ["itest-dup"]);
  });

  it("reports a foreign-key violation via isForeignKeyViolation", async () => {
    try {
      await query(`insert into public.wallets (id, member_id) values ($1, $2)`, ["itest-orphan", "no-such-member"]);
      throw new Error("expected a foreign key violation");
    } catch (error) {
      if (error instanceof Error && error.message === "expected a foreign key violation") throw error;
      expect(isForeignKeyViolation(error)).toBe(true);
    }
  });

  it("commits a transaction", async () => {
    await withTransaction(async (client) => {
      await client.query(`insert into public.wallet_entries (id, wallet_id, type, amount, balance_after) values ($1,$2,$3,$4,$5)`, [
        "itest-e1",
        "itest-1",
        "credit",
        499.5,
        499.5,
      ]);
    });
    const { rows } = await query(`select count(*)::int n from public.wallet_entries where id = $1`, ["itest-e1"]);
    expect(rows[0]?.n).toBe(1);
  });

  it("rolls a transaction back when the work throws", async () => {
    await expect(
      withTransaction(async (client) => {
        await client.query(`insert into public.wallet_entries (id, wallet_id, type, amount, balance_after) values ($1,$2,$3,$4,$5)`, [
          "itest-e2",
          "itest-1",
          "debit",
          10,
          489.5,
        ]);
        throw new Error("simulated failure mid-transaction");
      }),
    ).rejects.toThrow(/simulated failure/);

    const { rows } = await query(`select count(*)::int n from public.wallet_entries where id = $1`, ["itest-e2"]);
    expect(rows[0]?.n).toBe(0);
  });

  /**
   * The runbook claims every schema column survives the camelCase round-trip. That
   * was only ever asserted against a 51-name hand-picked fixture — 14% of the 356
   * distinct column names. This reads the real column list, so a new migration
   * cannot quietly add a name the mappers mangle (digits, runs of capitals).
   */
  it("round-trips every column name in the schema, not just the sampled ones", async () => {
    const { rows } = await query<{ column_name: string }>(
      `select distinct column_name from information_schema.columns
        where table_schema = 'public' order by 1`,
    );
    // Guards against the query silently returning nothing, which would make the
    // assertion below vacuously true.
    expect(rows.length).toBeGreaterThan(300);

    const broken = rows.map((r) => r.column_name).filter((column) => camelToSnake(snakeToCamel(column)) !== column);
    expect(broken).toEqual([]);
  });
});
