import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildRow,
  camelToSnake as scriptCamelToSnake,
  dedupeByPk,
  knownColumns,
  SKIP_FIELDS,
  stripUnknownColumns,
  TABLES,
  upsert,
  type ClientLike,
} from "../../scripts/migrate-firestore-to-supabase.mjs";
import { camelToSnake as libCamelToSnake, snakeToCamel } from "@/lib/postgres-mapping";
import { closePgPool, query, withTransaction } from "@/lib/postgres";

/**
 * Tests for the Firestore → Supabase copy script.
 *
 * These import the real functions from the script rather than restating its
 * logic, so a change to the script is what the test sees.
 */

/** Adapts @/lib/postgres to the minimal client shape the script asks for. */
async function withClient<T>(work: (client: ClientLike) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    const adapter: ClientLike = {
      async query(sql, params) {
        const result = await client.query(sql, params as unknown[]);
        return { rows: result.rows as Array<Record<string, unknown>>, rowCount: result.rowCount };
      },
    };
    return work(adapter);
  });
}

describe("copy script column mapping", () => {
  // The script carries its own copy of camelToSnake because it must run from the
  // shell with no build step. Nothing else keeps the two in step, so this is the
  // only thing standing between a future edit and documents landing in the wrong
  // columns.
  it("matches src/lib/postgres-mapping on awkward field names", () => {
    const cases = [
      "id",
      "memberId",
      "createdAt",
      "razorpayPaymentId",
      "gstin",
      "gstRate",
      "sessionDiscountPercent",
      "gstinURL", // documented: becomes gstin_u_r_l, and both must agree
      "otpExpiry",
      "a",
      "ABC",
      "line1",
      "line1Address",
      "priceMonthly",
      "totpBackupCodes",
      "isDemoAccount",
    ];
    for (const field of cases) {
      expect(scriptCamelToSnake(field), field).toBe(libCamelToSnake(field));
    }
  });

  it("skips the fields it says it skips", () => {
    expect(SKIP_FIELDS.has("messages")).toBe(true);
  });
});

const describeCopy = process.env.SUPABASE_DB_URL ? describe : describe.skip;

describeCopy("copy script against the real schema", () => {
  // member_streaks is deleted first: its member_id is a foreign key to members.
  const cleanup = async () => {
    await query(`delete from public.member_streaks where member_id like $1`, ["itest-copy-%"]);
    await query(`delete from public.members where id like $1`, ["itest-copy-%"]);
  };

  beforeAll(cleanup);

  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("maps every TABLES entry onto a table that exists", async () => {
    const { rows } = await query(`select table_name from information_schema.tables where table_schema = 'public'`);
    const existing = new Set(rows.map((r) => r.table_name as string));
    const missing = TABLES.filter((spec) => !existing.has(spec.table)).map((spec) => spec.table);
    // A table the script writes but the schema lacks would abort the copy at
    // cutover, with writes already frozen.
    expect(missing).toEqual([]);
  });

  it("round-trips every schema column through both camelToSnake implementations", async () => {
    const { rows } = await query(`select distinct column_name from information_schema.columns where table_schema = 'public'`);
    const columns = rows.map((r) => r.column_name as string);
    expect(columns.length).toBeGreaterThan(300);
    for (const column of columns) {
      const camel = snakeToCamel(column);
      expect(libCamelToSnake(camel), column).toBe(column);
      expect(scriptCamelToSnake(camel), column).toBe(column);
    }
  });

  it("reads the real column set for a table", async () => {
    const allowed = await withClient((client) => knownColumns(client, "members"));
    expect(allowed.has("id")).toBe(true);
    expect(allowed.has("email")).toBe(true);
    expect(allowed.has("not_a_column")).toBe(false);
  });

  it("refuses an unknown table rather than writing to nothing", async () => {
    await expect(withClient((client) => knownColumns(client, "no_such_table_xyz"))).rejects.toThrow(/no such table/);
  });

  it("copies a document carrying a field the schema does not have", async () => {
    // THE REGRESSION. Production Firestore documents carry fields the TypeScript
    // types never declared — an abandoned feature, an old spelling, a hand-written
    // doc. The schema was derived from the types, so such a field has no column.
    // Inserting it aborts the whole batch with "column does not exist", in the
    // middle of a cutover. Unknown fields must be dropped and reported instead.
    const spec = TABLES.find((s) => s.table === "members");
    if (!spec) throw new Error("members missing from TABLES");

    const doc = {
      id: "itest-copy-stray",
      data: () => ({
        name: "Stray Field Member",
        email: "itest-copy-stray@example.com",
        // None of these exist in the schema.
        abandonedExperimentFlag: true,
        oldSpellingOfPlan: "gold",
        legacyNested: { a: 1 },
      }),
    };

    const row = buildRow(spec, null, doc);
    expect(row.abandoned_experiment_flag).toBe(true);

    const allowed = await withClient((client) => knownColumns(client, spec.table));
    const stripped = stripUnknownColumns([row], allowed);

    expect(stripped.dropped).toEqual(new Set(["abandoned_experiment_flag", "old_spelling_of_plan", "legacy_nested"]));
    expect(stripped.rows[0]).not.toHaveProperty("abandoned_experiment_flag");
    expect(stripped.rows[0]?.name).toBe("Stray Field Member");

    // And it must actually reach the database — this is the line that used to throw.
    const wrote = await withClient((client) => upsert(client, spec, stripped.rows));
    expect(wrote).toBe(1);

    const { rows } = await query(`select name, email from public.members where id = $1`, ["itest-copy-stray"]);
    expect(rows[0].name).toBe("Stray Field Member");
    expect(rows[0].email).toBe("itest-copy-stray@example.com");
  });

  it("collapses duplicate primary keys within a batch instead of failing", async () => {
    // Postgres rejects a multi-row upsert that touches the same row twice:
    // "ON CONFLICT DO UPDATE command cannot affect row a second time". Two
    // documents can collide on one synthesised id, so this is reachable with
    // real data and would have killed the batch.
    const deduped = dedupeByPk(
      [
        { id: "dup", name: "First" },
        { id: "other", name: "Other" },
        { id: "dup", name: "Last" },
      ],
      "id",
    );
    expect(deduped.duplicates).toEqual(new Set(["dup"]));
    expect(deduped.rows).toHaveLength(2);
    expect(deduped.rows.find((r) => r.id === "dup")?.name).toBe("Last");

    const spec = TABLES.find((s) => s.table === "members");
    if (!spec) throw new Error("members missing from TABLES");
    const allowed = await withClient((client) => knownColumns(client, spec.table));

    const rows = [
      { id: "itest-copy-twice", name: "First Name", email: "itest-copy-twice@example.com" },
      { id: "itest-copy-twice", name: "Second Name", email: "itest-copy-twice@example.com" },
    ];
    const stripped = stripUnknownColumns(rows, allowed);
    await withClient((client) => upsert(client, spec, stripped.rows));

    const { rows: found } = await query(`select name from public.members where id = $1`, ["itest-copy-twice"]);
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("Second Name");
  });

  it("updates rather than duplicates when the same id is copied again", async () => {
    // The copy is expected to run at least twice — rehearsal, then the real
    // cutover — so a second pass must overwrite.
    const spec = TABLES.find((s) => s.table === "members");
    if (!spec) throw new Error("members missing from TABLES");
    const allowed = await withClient((client) => knownColumns(client, spec.table));

    const first = stripUnknownColumns([{ id: "itest-copy-rerun", name: "Pass One", email: "itest-copy-rerun@example.com" }], allowed);
    await withClient((client) => upsert(client, spec, first.rows));
    const second = stripUnknownColumns([{ id: "itest-copy-rerun", name: "Pass Two", email: "itest-copy-rerun@example.com" }], allowed);
    await withClient((client) => upsert(client, spec, second.rows));

    const { rows } = await query(`select name from public.members where id = $1`, ["itest-copy-rerun"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Pass Two");
  });

  it("derives the primary key from the spec, not from row shape", async () => {
    // member_streaks has no `id` column; its pk is the document id copied into
    // member_id. The old heuristic inferred the pk from the first row's keys and
    // fell through to `columns[0]`.
    const spec = TABLES.find((s) => s.table === "member_streaks");
    if (!spec) throw new Error("member_streaks missing from TABLES");
    expect(spec.pkFromDocId).toBe(true);
    expect(spec.pkColumn).toBe("member_id");

    const allowed = await withClient((client) => knownColumns(client, spec.table));
    // member_streaks.member_id is a real foreign key to members(id).
    await query(`insert into public.members (id, name, email) values ($1, $2, $3) on conflict (id) do nothing`, [
      "itest-copy-streak-member",
      "Streak Member",
      "itest-copy-streak@example.com",
    ]);
    const stripped = stripUnknownColumns([{ member_id: "itest-copy-streak-member", last_active_date: "2026-09-08" }], allowed);
    await withClient((client) => upsert(client, spec, stripped.rows));

    const { rows } = await query(`select last_active_date from public.member_streaks where member_id = $1`, [
      "itest-copy-streak-member",
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].last_active_date).toBe("2026-09-08");
  });

  it("renames the coupon usage count field onto the column that actually exists", async () => {
    // gemstoneCouponCustomerUsage documents store `count`. camelToSnake leaves
    // that as `count`, which is not a column — the table calls it `usage_count`.
    // Dropped as an unknown field, every customer's per-coupon limit would reset
    // at cutover and "once per customer" coupons could be reused.
    const spec = TABLES.find((s) => s.table === "gemstone_coupon_customer_usage");
    if (!spec) throw new Error("gemstone_coupon_customer_usage missing from TABLES");
    expect(spec.rename).toEqual({ count: "usage_count" });

    const row = buildRow(spec, null, {
      id: "WELCOME10_asha@example.com",
      data: () => ({ count: 2, updatedAt: new Date("2026-09-08T00:00:00Z") }),
    });
    expect(row.usage_count).toBe(2);
    expect("count" in row).toBe(false);

    const allowed = await withClient((client) => knownColumns(client, spec.table));
    // The whole point: the renamed field must survive, not be reported as stray.
    const stripped = stripUnknownColumns([row], allowed);
    expect(stripped.rows).toHaveLength(1);
    expect(stripped.rows[0].usage_count).toBe(2);
    expect(stripped.dropped).toEqual(new Set());

    await withClient((client) => upsert(client, spec, stripped.rows));
    const { rows } = await query(
      `select usage_count from public.gemstone_coupon_customer_usage where id = $1`,
      ["WELCOME10_asha@example.com"],
    );
    expect(Number(rows[0].usage_count)).toBe(2);

    await query(`delete from public.gemstone_coupon_customer_usage where id = $1`, [
      "WELCOME10_asha@example.com",
    ]);
  });

  it("copies gift cards and their payment index, whose code lives only in the document id", async () => {
    // gift-cards.ts keys giftCards by the code and giftCardPaymentIndex by the Razorpay payment id,
    // and stores neither in the document body. Both columns are NOT NULL, so unless the copy fills
    // them from the id, every gift card fails to copy at cutover.
    const cardSpec = TABLES.find((s) => s.table === "gift_cards");
    const indexSpec = TABLES.find((s) => s.table === "gift_card_payment_index");
    if (!cardSpec || !indexSpec) throw new Error("gift card tables missing from TABLES");

    const card = buildRow(cardSpec, null, {
      id: "AJG-ITESTCPY",
      data: () => ({ buyerId: null, buyerName: "Asha", amount: 1000, currency: "INR", recipientName: "Ravi", message: "", status: "unclaimed", redeemedBy: null, razorpayPaymentId: "pay_itestcopy", expiresAt: new Date() }),
    });
    const index = buildRow(indexSpec, null, { id: "pay_itestcopy", data: () => ({ code: "AJG-ITESTCPY", createdAt: new Date() }) });

    await query(`delete from public.gift_cards where id = $1`, ["AJG-ITESTCPY"]);
    await query(`delete from public.gift_card_payment_index where id = $1`, ["pay_itestcopy"]);
    for (const [spec, row] of [[cardSpec, card], [indexSpec, index]] as const) {
      const allowed = await withClient((client) => knownColumns(client, spec.table));
      expect(await withClient((client) => upsert(client, spec, stripUnknownColumns([row], allowed).rows))).toBe(1);
    }

    const cardRow = await query(`select code, amount::int as amount from public.gift_cards where id = $1`, ["AJG-ITESTCPY"]);
    expect(cardRow.rows[0]).toEqual({ code: "AJG-ITESTCPY", amount: 1000 });
    const indexRow = await query(`select razorpay_payment_id, code from public.gift_card_payment_index where id = $1`, ["pay_itestcopy"]);
    expect(indexRow.rows[0]).toEqual({ razorpay_payment_id: "pay_itestcopy", code: "AJG-ITESTCPY" });
    await query(`delete from public.gift_cards where id = $1`, ["AJG-ITESTCPY"]);
    await query(`delete from public.gift_card_payment_index where id = $1`, ["pay_itestcopy"]);
  });

  it("rejects a row with no value for its primary key", async () => {
    const spec = TABLES.find((s) => s.table === "members");
    if (!spec) throw new Error("members missing from TABLES");
    await expect(withClient((client) => upsert(client, spec, [{ name: "No Id" }]))).rejects.toThrow(/primary key/);
  });
});
