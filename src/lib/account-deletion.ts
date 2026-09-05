import "server-only";

import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { bucket, db, isStorageConfigured, withIndexFallback } from "@/lib/firestore";
import {
  ANONYMIZED_NAME,
  anonymizedEmailFor,
  bookingAnonymizationUpdate,
  EXPORT_EXCLUDED_MEMBER_FIELDS,
  gemstoneOrderAnonymizationUpdate,
  giftCardAnonymizationUpdate,
  invoiceAnonymizationUpdate,
  reviewAnonymizationUpdate,
  toPlainJson,
} from "@/lib/account-privacy";
import type { MemberIdentity } from "@/lib/member-auth";

/**
 * Self-service PII export and account deletion — the two "your rights" flows the privacy policy
 * promises. Deletion follows the same money-safety rules as the admin member-delete route
 * (src/app/api/members/[id]/route.ts): a wallet balance or an uncancellable live subscription
 * blocks deletion, financial records the business must legally retain (bookings, invoices,
 * gemstone orders, gift cards, subscription invoices) are anonymized rather than removed, and
 * everything the member alone owns is deleted outright.
 */

export class AccountDeletionBlockedError extends Error {}

/** Docs matched by a simple where(field == value) that are deleted outright, subcollections and
 * all. Kept as data (not code) so export and delete stay in sync about what a member "owns". */
const OWNED_BY_QUERY: Array<{ collection: string; field: string }> = [
  { collection: "journalEntries", field: "memberId" },
  { collection: "aiReadings", field: "memberId" },
  { collection: "kundliMatches", field: "memberId" },
  { collection: "numerologyReadings", field: "memberId" },
  { collection: "gemstoneRecommendations", field: "memberId" },
  { collection: "predictions", field: "memberId" },
  { collection: "messageThreads", field: "memberId" },
];

/** Single docs keyed by the member's uid that are deleted outright. */
const OWNED_BY_ID: string[] = [
  "cosmicProfileCards",
  "cosmicWeather",
  "memberStreaks",
  "aiReadingFreeClaims",
  "referrals", // referral doc id == refereeId; as a referee this record is theirs alone
];

async function queryAll(collection: string, field: string, value: string) {
  return withIndexFallback(
    () => db.collection(collection).where(field, "==", value).get(),
    { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as unknown as FirebaseFirestore.QuerySnapshot,
  );
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/** Everything the platform knows about this member, as a plain-JSON bundle suitable for a
 * download. Secrets (TOTP material) and internal QA flags are excluded. */
export async function buildMemberDataExport(member: MemberIdentity): Promise<Record<string, unknown>> {
  const memberRef = db.collection("members").doc(member.id);

  const [
    memberSnap,
    favoritesSnap,
    wishlistSnap,
    familySnap,
    bookingsSnap,
    invoicesSnap,
    subscriptionSnap,
    subscriptionInvoicesSnap,
    walletSnap,
    walletEntriesSnap,
    notificationsSnap,
    gemstoneOrdersSnap,
    gemstoneReviewsSnap,
    practitionerReviewsSnap,
    giftCardsSnap,
    chatSessionsSnap,
  ] = await Promise.all([
    memberRef.get(),
    memberRef.collection("favorites").get(),
    memberRef.collection("wishlist").get(),
    memberRef.collection("familyMembers").get(),
    queryAll("bookings", "clientEmail", member.email),
    queryAll("invoices", "customerEmail", member.email),
    db.collection("memberSubscriptions").doc(member.id).get(),
    queryAll("subscriptionInvoices", "memberId", member.id),
    db.collection("wallets").doc(member.id).get(),
    db.collection("wallets").doc(member.id).collection("entries").get(),
    queryAll("notifications", "recipientId", member.id),
    queryAll("gemstoneOrders", "memberId", member.id),
    queryAll("gemstoneReviews", "memberId", member.id),
    queryAll("practitionerReviews", "memberId", member.id),
    queryAll("giftCards", "buyerId", member.id),
    queryAll("chatSessions", "memberId", member.id),
  ]);

  const ownedByQuery: Record<string, unknown[]> = {};
  for (const { collection, field } of OWNED_BY_QUERY) {
    const snap = await queryAll(collection, field, member.id);
    ownedByQuery[collection] = snap.docs.map((doc) => toPlainJson({ id: doc.id, ...doc.data() })) as unknown[];
  }

  const ownedById: Record<string, unknown> = {};
  for (const collection of OWNED_BY_ID) {
    const snap = await db.collection(collection).doc(member.id).get();
    if (snap.exists) ownedById[collection] = toPlainJson({ id: snap.id, ...snap.data() });
  }

  const profile = memberSnap.exists ? { id: memberSnap.id, ...memberSnap.data() } : null;
  if (profile) {
    for (const field of EXPORT_EXCLUDED_MEMBER_FIELDS) delete (profile as Record<string, unknown>)[field];
  }

  const rows = (snap: { docs: FirebaseFirestore.QueryDocumentSnapshot[] } | FirebaseFirestore.QuerySnapshot) =>
    snap.docs.map((doc) => toPlainJson({ id: doc.id, ...doc.data() }));

  // notifications is queried on recipientId only (no composite index needed for ==), so filter
  // recipientType here rather than requiring a new index for a rare, on-demand export.
  const notifications = notificationsSnap.docs
    .filter((doc) => doc.data().recipientType === "member")
    .map((doc) => toPlainJson({ id: doc.id, ...doc.data() }));

  return {
    exportedAt: new Date().toISOString(),
    format: "adi-jyotish-guru/member-data-export.v1",
    profile: toPlainJson(profile),
    favorites: rows(favoritesSnap),
    wishlist: rows(wishlistSnap),
    familyMembers: rows(familySnap),
    bookings: rows(bookingsSnap),
    invoices: rows(invoicesSnap),
    subscription: subscriptionSnap.exists ? toPlainJson({ id: subscriptionSnap.id, ...subscriptionSnap.data() }) : null,
    subscriptionInvoices: rows(subscriptionInvoicesSnap),
    wallet: walletSnap.exists ? toPlainJson({ id: walletSnap.id, ...walletSnap.data() }) : null,
    walletLedger: rows(walletEntriesSnap),
    notifications,
    gemstoneOrders: rows(gemstoneOrdersSnap),
    gemstoneReviews: rows(gemstoneReviewsSnap),
    practitionerReviews: rows(practitionerReviewsSnap),
    giftCardsPurchased: rows(giftCardsSnap),
    chatSessions: rows(chatSessionsSnap),
    ...ownedByQuery,
    ...ownedById,
  };
}

/* ------------------------------------------------------------------ */
/* Deletion                                                            */
/* ------------------------------------------------------------------ */

/** Preconditions that must clear before deletion may start. Returns the human reason when
 * blocked so the UI can tell the member exactly what to resolve. */
export async function getDeletionBlockers(member: MemberIdentity): Promise<string[]> {
  const blockers: string[] = [];

  const walletSnap = await db.collection("wallets").doc(member.id).get();
  const balance = (walletSnap.data() as { balance?: number } | undefined)?.balance ?? 0;
  if (balance > 0) {
    blockers.push(`Your wallet still holds ₹${balance}. Spend it or write to support for a refund before deleting your account.`);
  }

  const activeChat = await withIndexFallback(
    () => db.collection("chatSessions").where("memberId", "==", member.id).where("status", "==", "active").limit(1).get(),
    null,
  );
  if (activeChat && !activeChat.empty) {
    blockers.push("You have a live chat session in progress. End it before deleting your account.");
  }

  return blockers;
}

/** Cancels a live Razorpay subscription (immediately) if one exists. Throws
 * AccountDeletionBlockedError when Razorpay refuses, so money never keeps flowing into a
 * deleted account. */
async function cancelSubscriptionIfAny(memberId: string) {
  const snap = await db.collection("memberSubscriptions").doc(memberId).get();
  if (!snap.exists) return;
  const data = snap.data() as { status?: string; razorpaySubscriptionId?: string | null };
  const terminal = ["cancelled", "completed", "expired", "pending_checkout"];
  if (!data.razorpaySubscriptionId || terminal.includes(data.status ?? "")) return;
  const { cancelMemberSubscription } = await import("@/lib/subscriptions");
  try {
    await cancelMemberSubscription(memberId, true);
  } catch (error) {
    throw new AccountDeletionBlockedError(
      `Your membership could not be cancelled automatically (${error instanceof Error ? error.message : "unknown error"}). Cancel it from Billing first, then try again.`,
    );
  }
}

async function deleteQueryDocs(collection: string, field: string, value: string) {
  const snap = await queryAll(collection, field, value);
  await Promise.all(snap.docs.map((doc) => db.recursiveDelete(doc.ref)));
}

async function anonymizeSnap(
  snap: { docs: FirebaseFirestore.QueryDocumentSnapshot[] } | FirebaseFirestore.QuerySnapshot,
  update: Record<string, unknown>,
) {
  const docs = snap.docs;
  for (let start = 0; start < docs.length; start += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(start, start + 400)) {
      batch.update(doc.ref, { ...update, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
}

/**
 * Irreversibly deletes the member's account. Caller is responsible for having verified the
 * member's intent (typed confirmation + a fresh TOTP code when 2FA is on) and for revoking the
 * session cookie afterwards. Order matters: blockers first, then Razorpay, then data, then the
 * Firebase Auth user last — so a partial failure can be retried while the member can still
 * sign in.
 */
export async function deleteMemberAccount(member: MemberIdentity): Promise<void> {
  const blockers = await getDeletionBlockers(member);
  if (blockers.length) throw new AccountDeletionBlockedError(blockers.join(" "));

  await cancelSubscriptionIfAny(member.id);

  const anonEmail = anonymizedEmailFor(member.id);

  // 1. Anonymize retained financial/public records.
  await anonymizeSnap(await queryAll("bookings", "clientEmail", member.email), bookingAnonymizationUpdate(anonEmail));
  await anonymizeSnap(await queryAll("invoices", "customerEmail", member.email), { ...invoiceAnonymizationUpdate(anonEmail), memberId: null });
  await anonymizeSnap(await queryAll("gemstoneOrders", "memberId", member.id), { ...gemstoneOrderAnonymizationUpdate(), memberId: null });
  await anonymizeSnap(await queryAll("subscriptionInvoices", "memberId", member.id), { memberId: null });
  await anonymizeSnap(await queryAll("giftCards", "buyerId", member.id), giftCardAnonymizationUpdate());
  await anonymizeSnap(await queryAll("gemstoneReviews", "memberId", member.id), reviewAnonymizationUpdate());
  await anonymizeSnap(await queryAll("practitionerReviews", "memberId", member.id), reviewAnonymizationUpdate());

  // 2. Ended chat sessions carry practitioner earnings (capturedAmount is summed for payouts),
  //    so the session doc survives — but its transcript is the member's PII and goes.
  const chatSnap = await queryAll("chatSessions", "memberId", member.id);
  for (const doc of chatSnap.docs) {
    await db.recursiveDelete(doc.ref.collection("messages"));
    await doc.ref.update({ memberId: `deleted:${anonEmail}`, updatedAt: FieldValue.serverTimestamp() });
  }

  // 3. Delete everything the member alone owns.
  for (const { collection, field } of OWNED_BY_QUERY) {
    await deleteQueryDocs(collection, field, member.id);
  }
  for (const collection of OWNED_BY_ID) {
    await db.recursiveDelete(db.collection(collection).doc(member.id)).catch(() => {});
  }

  // Member-scoped notifications: recipientId == uid AND recipientType == member. Single-field
  // query + in-memory filter, same trade-off as the export.
  const notificationsSnap = await queryAll("notifications", "recipientId", member.id);
  const memberNotifications = notificationsSnap.docs.filter((doc) => doc.data().recipientType === "member");
  for (let start = 0; start < memberNotifications.length; start += 400) {
    const batch = db.batch();
    for (const doc of memberNotifications.slice(start, start + 400)) batch.delete(doc.ref);
    await batch.commit();
  }

  // 4. Wallet (balance already verified ₹0) with its ledger + holds, then the member doc tree
  //    (favorites, wishlist, familyMembers subcollections included).
  await db.recursiveDelete(db.collection("wallets").doc(member.id)).catch(() => {});
  await db.recursiveDelete(db.collection("memberSubscriptions").doc(member.id)).catch(() => {});
  await db.recursiveDelete(db.collection("members").doc(member.id));

  // 5. Uploaded palm/face photos live under prefixes keyed by uid in the private bucket.
  if (isStorageConfigured()) {
    await bucket().deleteFiles({ prefix: `palm-readings/${member.id}/` }).catch(() => {});
    await bucket().deleteFiles({ prefix: `face-readings/${member.id}/` }).catch(() => {});
  }

  // 6. Firebase Auth last — if anything above failed, the member can still sign in and retry.
  try {
    await getAuth().revokeRefreshTokens(member.id);
    await getAuth().deleteUser(member.id);
  } catch {
    // Auth user already gone — the app's own data removal is what matters.
  }

  // A deletion is an audit-worthy event even without an admin actor.
  await db.collection("auditLogs").add({
    adminId: null,
    adminName: ANONYMIZED_NAME,
    action: "member.self_deleted",
    entityType: "member",
    entityId: member.id,
    details: null,
    createdAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
}
