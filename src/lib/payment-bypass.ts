import "server-only";

import type { MemberIdentity } from "@/lib/member-auth";

/**
 * Marks a member as able to use every paid feature without paying — a QA account that can walk the
 * whole product end to end without a card or a funded wallet.
 *
 * This is a real bypass of real money, so it is deliberately narrow:
 *
 *  - It lives as `paymentBypass: true` on the member's Firestore document. Only the Admin SDK
 *    writes there; no route, form or client action can set it, so a member cannot grant it to
 *    themselves and it cannot arrive from request input.
 *  - It is additionally gated on ALLOW_PAYMENT_BYPASS. Without that variable set on the
 *    deployment, the flag on the document does nothing at all — so a bypass account created for
 *    staging stays inert if that same database is ever pointed at a production build.
 *  - Everything it touches still records a normal ledger/reading row, just at zero cost, so the
 *    account's activity is visible in the admin panel rather than invisible.
 *
 * The two conditions together mean turning this on takes a deliberate act in two separate places.
 */
export function isPaymentBypassEnabled() {
  return process.env.ALLOW_PAYMENT_BYPASS === "true";
}

export function memberBypassesPayment(member: Pick<MemberIdentity, "paymentBypass">) {
  return isPaymentBypassEnabled() && member.paymentBypass === true;
}
