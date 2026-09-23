import { afterEach, describe, expect, it, vi } from "vitest";

import { isPaymentBypassEnabled, memberBypassesPayment } from "@/lib/payment-bypass";

/**
 * This is the only switch that lets an account consume paid features without paying, so the
 * property that matters is not that it works — it is that it stays OFF. Both conditions must
 * hold, and each must be exact: a truthy check instead of === "true" would turn ALLOW_PAYMENT_BYPASS
 * = "false" into a live bypass, and dropping the env gate would make a staging QA account free on
 * production the moment that database is pointed at a production build. Neither mistake fails any
 * feature test.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isPaymentBypassEnabled", () => {
  it("is false when the variable is unset", () => {
    vi.stubEnv("ALLOW_PAYMENT_BYPASS", "");
    expect(isPaymentBypassEnabled()).toBe(false);
  });

  it("is true only for the exact string 'true'", () => {
    vi.stubEnv("ALLOW_PAYMENT_BYPASS", "true");
    expect(isPaymentBypassEnabled()).toBe(true);
  });

  it.each(["false", "TRUE", "True", "1", "yes", "on", " true"])(
    "stays false for %j, which a truthy check would wrongly accept",
    (value) => {
      vi.stubEnv("ALLOW_PAYMENT_BYPASS", value);
      expect(isPaymentBypassEnabled()).toBe(false);
    },
  );
});

describe("memberBypassesPayment", () => {
  it("requires both the deployment flag and the member flag", () => {
    vi.stubEnv("ALLOW_PAYMENT_BYPASS", "true");
    expect(memberBypassesPayment({ paymentBypass: true })).toBe(true);
  });

  it("denies a flagged member when the deployment does not allow bypass", () => {
    // The staging-account-on-production case: the document flag survives a database copy, the
    // environment variable does not.
    vi.stubEnv("ALLOW_PAYMENT_BYPASS", "");
    expect(memberBypassesPayment({ paymentBypass: true })).toBe(false);
  });

  it("denies an unflagged member even where bypass is allowed", () => {
    vi.stubEnv("ALLOW_PAYMENT_BYPASS", "true");
    expect(memberBypassesPayment({ paymentBypass: false })).toBe(false);
  });

  it("denies a member whose document has no paymentBypass field at all", () => {
    // Both of getCurrentMember's construction sites do produce a real boolean today — the
    // Firestore path coerces with `=== true`, and the Postgres column is `not null default
    // false` — so the cast here is not describing current behaviour. It guards the boundary:
    // Firestore documents are schemaless, this predicate decides whether money changes hands,
    // and a third construction site that forgot the coercion must still fail closed.
    vi.stubEnv("ALLOW_PAYMENT_BYPASS", "true");
    expect(memberBypassesPayment({ paymentBypass: undefined as never })).toBe(false);
  });

  it.each([
    ["a string", "true"],
    ["a number", 1],
    ["an object", {}],
  ])("denies when paymentBypass is %s rather than boolean true", (_label, value) => {
    vi.stubEnv("ALLOW_PAYMENT_BYPASS", "true");
    expect(memberBypassesPayment({ paymentBypass: value as never })).toBe(false);
  });

  it("denies everything when neither condition holds", () => {
    vi.stubEnv("ALLOW_PAYMENT_BYPASS", "");
    expect(memberBypassesPayment({ paymentBypass: false })).toBe(false);
  });
});
