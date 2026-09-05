import { describe, expect, it } from "vitest";
import {
  ANONYMIZED_NAME,
  anonymizedEmailFor,
  bookingAnonymizationUpdate,
  gemstoneOrderAnonymizationUpdate,
  giftCardAnonymizationUpdate,
  invoiceAnonymizationUpdate,
  reviewAnonymizationUpdate,
  toPlainJson,
} from "./account-privacy";

describe("anonymizedEmailFor", () => {
  it("is deterministic for the same uid (safe to retry the deletion job)", () => {
    expect(anonymizedEmailFor("uid-123")).toBe(anonymizedEmailFor("uid-123"));
  });

  it("differs between uids", () => {
    expect(anonymizedEmailFor("uid-123")).not.toBe(anonymizedEmailFor("uid-456"));
  });

  it("does not contain the raw uid and uses the reserved .invalid TLD", () => {
    const email = anonymizedEmailFor("uid-123");
    expect(email).not.toContain("uid-123");
    expect(email.endsWith("@account-deleted.invalid")).toBe(true);
  });
});

describe("anonymization updates", () => {
  const anonEmail = anonymizedEmailFor("uid-123");

  it("scrubs every personal field off a booking but keeps the record", () => {
    const update = bookingAnonymizationUpdate(anonEmail);
    expect(update.clientName).toBe(ANONYMIZED_NAME);
    expect(update.clientEmail).toBe(anonEmail);
    expect(update.clientPhone).toBeNull();
    expect(update.birthDate).toBe("");
    expect(update.birthTime).toBe("");
    expect(update.birthPlace).toBe("");
    expect(update.notes).toBeNull();
    expect(update.kundliSummary).toBeNull();
    expect(update.varshphalSummary).toBeNull();
    // Money/scheduling fields must NOT be touched.
    expect(update).not.toHaveProperty("servicePrice");
    expect(update).not.toHaveProperty("paymentStatus");
    expect(update).not.toHaveProperty("status");
  });

  it("keeps invoices joinable to their anonymized booking via the same token email", () => {
    const update = invoiceAnonymizationUpdate(anonEmail);
    expect(update.customerEmail).toBe(bookingAnonymizationUpdate(anonEmail).clientEmail);
    expect(update.customerName).toBe(ANONYMIZED_NAME);
    expect(update).not.toHaveProperty("amount");
  });

  it("keeps gemstone order city/state/pincode (GST place of supply) while scrubbing identity", () => {
    const update = gemstoneOrderAnonymizationUpdate();
    expect(update.shippingName).toBe(ANONYMIZED_NAME);
    expect(update.guestEmail).toBeNull();
    expect(update.shippingLine1).toBe("Removed");
    expect(update).not.toHaveProperty("shippingCity");
    expect(update).not.toHaveProperty("shippingState");
    expect(update).not.toHaveProperty("shippingPincode");
    expect(update).not.toHaveProperty("total");
  });

  it("detaches reviews from the person without deleting them", () => {
    const update = reviewAnonymizationUpdate();
    expect(update.memberId).toBeNull();
    expect(update.reviewerName).toBe(ANONYMIZED_NAME);
    expect(update).not.toHaveProperty("rating");
    expect(update).not.toHaveProperty("body");
  });

  it("keeps gift cards spendable while removing who bought them", () => {
    const update = giftCardAnonymizationUpdate();
    expect(update.buyerName).toBe(ANONYMIZED_NAME);
    expect(update).not.toHaveProperty("amount");
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("code");
  });
});

describe("toPlainJson", () => {
  it("passes primitives through untouched", () => {
    expect(toPlainJson(null)).toBeNull();
    expect(toPlainJson(42)).toBe(42);
    expect(toPlainJson("hi")).toBe("hi");
    expect(toPlainJson(true)).toBe(true);
  });

  it("converts Dates and Timestamp-likes to ISO strings, recursively", () => {
    const when = new Date("2026-01-15T10:30:00.000Z");
    const timestampLike = { toDate: () => when };
    const input = {
      createdAt: timestampLike,
      updatedAt: when,
      nested: { list: [timestampLike, "plain", 7] },
    };
    expect(toPlainJson(input)).toEqual({
      createdAt: "2026-01-15T10:30:00.000Z",
      updatedAt: "2026-01-15T10:30:00.000Z",
      nested: { list: ["2026-01-15T10:30:00.000Z", "plain", 7] },
    });
  });

  it("does not mistake objects without a callable toDate for timestamps", () => {
    expect(toPlainJson({ toDate: "not-a-function" })).toEqual({ toDate: "not-a-function" });
  });
});
