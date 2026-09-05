// Pure helpers shared by the self-service account-deletion flow (src/lib/account-deletion.ts)
// and its unit tests. Deliberately free of any Firestore/server import so the anonymization
// rules — which fields count as PII on records the business must retain — are testable in
// isolation and readable in one place.

import { createHash } from "node:crypto";

/** Exact phrase a member must type to confirm irreversible account deletion. */
export const DELETE_CONFIRMATION_PHRASE = "DELETE";

/** Replacement display name written over PII on retained financial records. */
export const ANONYMIZED_NAME = "Deleted member";

/**
 * Deterministic, non-reversible replacement email for retained financial records (bookings,
 * invoices). Uses a short hash of the uid rather than the uid itself so the retained record
 * can't be trivially joined back to other systems that still know the Firebase uid, while
 * remaining stable if the deletion job is retried. `.invalid` is the RFC 2606 reserved TLD —
 * it can never deliver mail.
 */
export function anonymizedEmailFor(memberId: string): string {
  const digest = createHash("sha256").update(memberId).digest("hex").slice(0, 12);
  return `deleted-${digest}@account-deleted.invalid`;
}

/**
 * Bookings are retained (practitioner earnings, GST, dispute history all hang off them) but
 * every personal field is scrubbed. `clientEmail` is the join key used by invoices and the
 * member's own booking list, so it's replaced with the same anonymized token invoices get.
 */
export function bookingAnonymizationUpdate(anonEmail: string): Record<string, unknown> {
  return {
    clientName: ANONYMIZED_NAME,
    clientEmail: anonEmail,
    clientPhone: null,
    birthDate: "",
    birthTime: "",
    birthPlace: "",
    notes: null,
    kundliSummary: null,
    varshphalSummary: null,
  };
}

/** Invoices are legally retained (GST) — scrub the person, keep the money. */
export function invoiceAnonymizationUpdate(anonEmail: string): Record<string, unknown> {
  return {
    customerName: ANONYMIZED_NAME,
    customerEmail: anonEmail,
  };
}

/**
 * Gemstone orders are retained for GST/accounting. City, state, and pincode stay (place of
 * supply determines GST treatment); everything that identifies the person goes.
 */
export function gemstoneOrderAnonymizationUpdate(): Record<string, unknown> {
  return {
    guestName: null,
    guestEmail: null,
    guestPhone: null,
    shippingName: ANONYMIZED_NAME,
    shippingPhone: "",
    shippingLine1: "Removed",
    shippingLine2: null,
  };
}

/** Published reviews stay (they're part of practitioners'/products' public record) but are
 * detached from the deleted person. */
export function reviewAnonymizationUpdate(): Record<string, unknown> {
  return {
    memberId: null,
    reviewerName: ANONYMIZED_NAME,
  };
}

/** Gift cards someone bought stay redeemable/redeemed as financial records — only the buyer's
 * name is personal. The recipient name/message were chosen by the buyer as a gift and may
 * identify them too, so both are scrubbed. */
export function giftCardAnonymizationUpdate(): Record<string, unknown> {
  return {
    buyerName: ANONYMIZED_NAME,
    recipientName: "a friend",
    message: "",
  };
}

/** Server-side member-document fields that must never appear in a data export. */
export const EXPORT_EXCLUDED_MEMBER_FIELDS = [
  "totpSecret",
  "totpPendingSecret",
  "totpBackupCodes",
  "paymentBypass",
] as const;

/** Recursively converts Firestore Timestamps/Dates to ISO strings so an export bundle is plain
 * JSON. Anything with a callable `toDate` is treated as a timestamp. */
export function toPlainJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  const maybeTimestamp = value as { toDate?: unknown };
  if (typeof maybeTimestamp.toDate === "function") {
    return (maybeTimestamp as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(toPlainJson);
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = toPlainJson(entry);
  }
  return out;
}
