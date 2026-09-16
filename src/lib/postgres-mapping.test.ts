import { describe, expect, it } from "vitest";

import { buildUpsert, camelToSnake, payloadToSnake, rowToCamel, snakeToCamel, toNumber } from "@/lib/postgres-mapping";

/**
 * The mapping is the seam between the Firestore document models in src/lib/ and
 * the Postgres schema in supabase/migrations/. A wrong translation does not fail
 * loudly — it reads back as undefined and the page renders empty.
 *
 * The pairs below are real field/column names taken from the TypeScript models
 * and the migrations. They were cross-checked against a live database created
 * from those migrations; keep them in sync if either side is renamed.
 */

const FIELD_TO_COLUMN: ReadonlyArray<readonly [string, string]> = [
  ["id", "id"],
  ["memberId", "member_id"],
  ["practitionerId", "practitioner_id"],
  ["razorpaySubscriptionId", "razorpay_subscription_id"],
  ["razorpayPlanIdMonthly", "razorpay_plan_id_monthly"],
  ["cancelAtPeriodEnd", "cancel_at_period_end"],
  ["dunningNoticeSentAt", "dunning_notice_sent_at"],
  ["renewalReminderSentAt", "renewal_reminder_sent_at"],
  ["sessionDiscountPercent", "session_discount_percent"],
  ["totpBackupCodes", "totp_backup_codes"],
  ["totpPendingSecret", "totp_pending_secret"],
  ["upiId", "upi_id"],
  ["upiIdEnc", "upi_id_enc"],
  ["bankAccountNumberEnc", "bank_account_number_enc"],
  ["payoutDetailsUpdatedAt", "payout_details_updated_at"],
  ["isAiPowered", "is_ai_powered"],
  ["hasPortalAccess", "has_portal_access"],
  ["isDemoAccount", "is_demo_account"],
  ["isSystem", "is_system"],
  ["gstin", "gstin"],
  ["bookingLeadMinutes", "booking_lead_minutes"],
  ["shippingPincode", "shipping_pincode"],
  ["weightCarat", "weight_carat"],
  ["compareAtPrice", "compare_at_price"],
  ["whoShouldWear", "who_should_wear"],
  ["minOrderAmount", "min_order_amount"],
  ["perCustomerLimit", "per_customer_limit"],
  ["maxDiscountAmount", "max_discount_amount"],
  ["customerIdentifier", "customer_identifier"],
  ["balanceAfter", "balance_after"],
  ["walletHoldId", "wallet_hold_id"],
  ["capturedAmount", "captured_amount"],
  ["ratePerMinute", "rate_per_minute"],
  ["pricingModel", "pricing_model"],
  ["lastAiError", "last_ai_error"],
  ["leftPalmImagePath", "left_palm_image_path"],
  ["personaSlug", "persona_slug"],
  ["readByMember", "read_by_member"],
  ["helpfulVotes", "helpful_votes"],
  ["moonHouse", "moon_house"],
  ["moonARashi", "moon_a_rashi"],
  ["personABirthDate", "person_a_birth_date"],
  ["sadeSatiPhase", "sade_sati_phase"],
  ["rahuKetuNote", "rahu_ketu_note"],
  ["lagnaLord", "lagna_lord"],
  ["entryDate", "entry_date"],
  ["experimentKey", "experiment_key"],
  ["adminCount", "admin_count"],
  ["sortOrder", "sort_order"],
  ["metaDescription", "meta_description"],
  ["gstRate", "gst_rate"],
];

describe("camelToSnake", () => {
  it.each(FIELD_TO_COLUMN)("maps %s to %s", (field, column) => {
    expect(camelToSnake(field)).toBe(column);
  });

  it("leaves an already-lowercase single word untouched", () => {
    expect(camelToSnake("slug")).toBe("slug");
  });

  it("matches the rule the .mjs copy scripts implement", () => {
    // scripts/migrate-firestore-to-supabase.mjs has its own copy of this function
    // because it cannot import from src/. This is the same expression, written out
    // here so a change on either side shows up as a failing test.
    const scriptRule = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    for (const [field] of FIELD_TO_COLUMN) expect(camelToSnake(field)).toBe(scriptRule(field));
  });
});

describe("snakeToCamel", () => {
  it.each(FIELD_TO_COLUMN)("maps %s back from %s", (field, column) => {
    expect(snakeToCamel(column)).toBe(field);
  });

  it("round-trips every pair in both directions", () => {
    for (const [field, column] of FIELD_TO_COLUMN) {
      expect(snakeToCamel(camelToSnake(field))).toBe(field);
      expect(camelToSnake(snakeToCamel(column))).toBe(column);
    }
  });
});

describe("toNumber", () => {
  it("coerces the strings node-postgres returns for numeric columns", () => {
    // numeric(14,2) comes back as a string, not a number.
    expect(toNumber("499.00")).toBe(499);
    expect(toNumber("0")).toBe(0);
    expect(toNumber("-12.5")).toBe(-12.5);
  });

  it("passes a real number through", () => {
    expect(toNumber(499)).toBe(499);
  });

  it("maps null and undefined to null", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });

  it("maps an empty string to null, not 0", () => {
    expect(toNumber("")).toBeNull();
    expect(toNumber("   ")).toBeNull();
  });

  it("returns NaN for genuinely non-numeric input so callers can detect bad data", () => {
    expect(Number.isNaN(toNumber("not-a-number"))).toBe(true);
  });
});

describe("rowToCamel", () => {
  it("renames columns into the shape the app models use", () => {
    const row = rowToCamel<{ memberId: string; razorpaySubscriptionId: string | null }>({
      member_id: "abc",
      razorpay_subscription_id: null,
    });
    expect(row).toEqual({ memberId: "abc", razorpaySubscriptionId: null });
  });

  it("coerces only the numeric columns it is told about", () => {
    const row = rowToCamel<{ price: number | null }>({ price: "499.00" }, ["price"]);
    expect(row.price).toBe(499);
  });

  it("leaves a numeric-looking column alone when it is not listed", () => {
    // shipping_pincode is "400001" and MUST stay a string: coercing it would drop
    // leading zeros on pincodes like "011001" and break address formatting.
    const row = rowToCamel<{ shippingPincode: unknown }>({ shipping_pincode: "011001" });
    expect(row.shippingPincode).toBe("011001");
  });

  it("accepts camelCase names in the numeric list, matching how callers write them", () => {
    const row = rowToCamel<{ servicePrice: number | null }>({ service_price: "1200.00" }, ["servicePrice"]);
    expect(row.servicePrice).toBe(1200);
  });

  it("keeps a Date object as a Date — timestamptz already matches the models", () => {
    const when = new Date("2026-09-07T00:00:00Z");
    const row = rowToCamel<{ createdAt: unknown }>({ created_at: when });
    expect(row.createdAt).toBeInstanceOf(Date);
  });
});

describe("payloadToSnake", () => {
  it("renames every key", () => {
    expect(payloadToSnake({ memberId: "a", cancelAtPeriodEnd: true })).toEqual({
      member_id: "a",
      cancel_at_period_end: true,
    });
  });

  it("drops undefined so the column default applies instead of writing null", () => {
    expect(payloadToSnake({ slug: "x", notes: undefined })).toEqual({ slug: "x" });
  });

  it("keeps an explicit null — that is a real value, not an omission", () => {
    expect(payloadToSnake({ cancelledAt: null })).toEqual({ cancelled_at: null });
  });
});

describe("buildUpsert", () => {
  it("produces a parameterised insert with no interpolated value", () => {
    const { sql, values } = buildUpsert("members", { id: "u1", name: "Asha", email: "a@x.com" });
    expect(sql).toBe(
      'insert into public."members" ("id", "name", "email") values ($1, $2, $3) ' +
        'on conflict ("id") do update set "name" = excluded."name", "email" = excluded."email"',
    );
    expect(values).toEqual(["u1", "Asha", "a@x.com"]);
    // A value containing SQL must end up as a bound parameter, never in the text.
    expect(sql).not.toContain("Asha");
  });

  it("never updates the primary key in the conflict clause", () => {
    const { sql } = buildUpsert("wallets", { id: "u1", balance: 10 });
    expect(sql).not.toContain('"id" = excluded."id", ');
    expect(sql).toContain('"balance" = excluded."balance"');
  });

  it("supports a non-default primary key", () => {
    const { sql, values } = buildUpsert("gemini_usage", { day: "2026-09-07", count: 5 }, "day");
    expect(sql).toContain('on conflict ("day")');
    expect(values).toEqual(["2026-09-07", 5]);
  });

  it("handles a primary-key-only row without producing an empty SET", () => {
    const { sql } = buildUpsert("chat_active_locks", { member_id: "u1" }, "member_id");
    expect(sql).toContain('"member_id" = excluded."member_id"');
  });

  it("rejects an empty row", () => {
    expect(() => buildUpsert("members", {})).toThrow(/empty row/);
  });

  it("rejects a row missing its primary key", () => {
    expect(() => buildUpsert("members", { name: "Asha" })).toThrow(/missing primary key/);
  });
});
