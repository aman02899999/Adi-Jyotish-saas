import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db, withIndexFallback } from "@/lib/firestore";
import { sendEmail, genericNotificationEmailHtml } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { shouldRunNow } from "@/lib/automation-state";
import { FESTIVALS } from "@/lib/festivals";
import { getPromoBanner, updatePromoBanner } from "@/lib/promo-banner";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { notifyAdmins, createNotification } from "@/lib/notifications";
import { getPlanById } from "@/lib/plans";

const WINBACK_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;
const WINBACK_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;

/** Weekly-gated sweep (piggybacks on the 15-minute housekeeping cron via shouldRunNow): emails
 * members who haven't logged in for 30+ days, at most once every 60 days per member so a
 * permanently-lapsed member doesn't get re-emailed every week forever. */
export async function sendWinBackEmails() {
  if (!(await shouldRunNow("winback-sweep", 6 * 24 * 60 * 60 * 1000))) return { skipped: true as const };

  const cutoff = new Date(Date.now() - WINBACK_INACTIVITY_MS);
  const snap = await db.collection("members").where("lastLoginAt", "<", cutoff).get();
  const dashboardUrl = new URL("/dashboard", getSiteUrl()).toString();

  let sent = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { email?: string; name?: string; isDemoAccount?: boolean; lastWinbackSentAt?: FirebaseFirestore.Timestamp; active?: boolean };
    if (!data.email || data.isDemoAccount || data.active === false) continue;
    if (data.lastWinbackSentAt && Date.now() - data.lastWinbackSentAt.toMillis() < WINBACK_COOLDOWN_MS) continue;

    await sendEmail({
      to: data.email,
      subject: "The sky has moved since you last checked in",
      html: genericNotificationEmailHtml({
        title: "We miss you at the studio",
        name: data.name ?? "there",
        body: "It's been a while since your last visit. Your birth chart, daily transits, and wallet are all still here — come see what's changed in your cosmic weather.",
        ctaLabel: "Open your dashboard",
        ctaUrl: dashboardUrl,
      }),
    }).catch((error) => console.error("Win-back email failed", error));

    await doc.ref.update({ lastWinbackSentAt: FieldValue.serverTimestamp() });
    sent++;
  }
  return { checked: snap.size, sent };
}

const FESTIVAL_LEAD_DAYS = 3;

/** Daily-gated sweep: turns the site-wide promo banner on ~3 days before a festival in
 * festivals.ts and off again once it's passed — so the banner tracks a merely-updated data file
 * instead of needing someone to remember to flip it manually for every festival, all year. Never
 * touches a banner an admin has ever saved through the admin UI (source === "manual") — that's a
 * deliberate, permanent opt-out of the automation, not just "currently off". */
export async function syncFestivalPromoBanner() {
  if (!(await shouldRunNow("festival-banner-sync", 20 * 60 * 60 * 1000))) return { skipped: true as const };

  const banner = await getPromoBanner();
  if (banner.source === "manual") return { skipped: true as const, reason: "manual override" };

  const now = Date.now();
  const leadMs = FESTIVAL_LEAD_DAYS * 24 * 60 * 60 * 1000;
  const upcoming = FESTIVALS
    .map((festival) => ({ festival, dateMs: new Date(`${festival.date}T00:00:00Z`).getTime() }))
    .filter(({ dateMs }) => dateMs >= now - 24 * 60 * 60 * 1000 && dateMs - now <= leadMs)
    .sort((a, b) => a.dateMs - b.dateMs)[0];

  if (upcoming) {
    if (banner.festivalKey === upcoming.festival.slug && banner.enabled) return { active: upcoming.festival.slug, changed: false };
    await updatePromoBanner({
      enabled: true,
      message: `${upcoming.festival.name} is here — see your real muhurat timing for ${upcoming.festival.rangeLabel}.`,
      ctaLabel: "View muhurat",
      ctaHref: `/festivals/${upcoming.festival.slug}`,
      source: "auto",
      festivalKey: upcoming.festival.slug,
    });
    return { active: upcoming.festival.slug, changed: true };
  }

  if (banner.source === "auto" && banner.festivalKey) {
    await updatePromoBanner({ enabled: false, message: banner.message, ctaLabel: null, ctaHref: null, source: "auto", festivalKey: null });
    return { active: null, changed: true };
  }
  return { active: null, changed: false };
}

/** Weekly-gated sweep: emails each active, portal-enabled practitioner a summary of the past 7
 * days (sessions completed, earnings, average rating) instead of leaving them to notice trends by
 * clicking into the earnings tab themselves. Skips practitioners with a quiet week (0 completed
 * sessions) so the digest doesn't read as spam on a slow week. */
export async function sendPractitionerWeeklyDigest() {
  if (!(await shouldRunNow("practitioner-digest", 6 * 24 * 60 * 60 * 1000))) return { skipped: true as const };

  const practitionersSnap = await db.collection("practitioners").where("active", "==", true).get();
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const earningsUrl = new URL("/practitioner/earnings", getSiteUrl()).toString();

  let sent = 0;
  for (const doc of practitionersSnap.docs) {
    const data = doc.data() as { email?: string; name?: string; isDemoAccount?: boolean; hasPortalAccess?: boolean };
    if (!data.email || data.isDemoAccount || !data.hasPortalAccess) continue;

    const [bookingsSnap, reviewsSnap] = await Promise.all([
      db.collection("bookings").where("practitionerId", "==", doc.id).where("status", "==", "completed").where("scheduledAt", ">=", weekStart).get(),
      db.collection("practitionerReviews").where("practitionerId", "==", doc.id).get(),
    ]);
    if (bookingsSnap.empty) continue;

    let earnings = 0;
    for (const bookingDoc of bookingsSnap.docs) {
      const booking = bookingDoc.data() as { paymentStatus?: string; servicePrice?: number };
      if (booking.paymentStatus === "paid") earnings += booking.servicePrice ?? 0;
    }
    const ratings = reviewsSnap.docs.map((r) => (r.data() as { rating?: number }).rating).filter((value): value is number => typeof value === "number");
    const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
    const sessionLabel = `${bookingsSnap.size} session${bookingsSnap.size === 1 ? "" : "s"}`;

    await sendEmail({
      to: data.email,
      subject: "Your week at the studio",
      html: genericNotificationEmailHtml({
        title: "Your weekly summary",
        name: data.name ?? "there",
        body: `This past week: ${sessionLabel} completed, ₹${earnings} earned${avgRating !== null ? `, ${avgRating}/5 average rating` : ""}. Keep it up.`,
        ctaLabel: "Open your earnings",
        ctaUrl: earningsUrl,
      }),
    }).catch((error) => console.error("Practitioner digest email failed", error));
    sent++;
  }
  return { checked: practitionersSnap.size, sent };
}

const REVIEW_VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const REVIEW_VELOCITY_THRESHOLD = 4;

/** Daily-gated sweep: a genuine member reviewing multiple different practitioners/products in one
 * day is plausible; the same member posting 4+ reviews across either collection in 24 hours looks
 * more like review-farming than genuine feedback. Flags for a human to look at — never auto-hides
 * or auto-bans, since this is a heuristic, not proof. */
export async function flagReviewVelocityAbuse() {
  if (!(await shouldRunNow("review-velocity-sweep", 24 * 60 * 60 * 1000))) return { skipped: true as const };

  const windowStart = new Date(Date.now() - REVIEW_VELOCITY_WINDOW_MS);
  const [practitionerReviewsSnap, gemstoneReviewsSnap] = await Promise.all([
    db.collection("practitionerReviews").where("createdAt", ">=", windowStart).get(),
    db.collection("gemstoneReviews").where("createdAt", ">=", windowStart).get(),
  ]);

  const countByMember = new Map<string, number>();
  for (const doc of [...practitionerReviewsSnap.docs, ...gemstoneReviewsSnap.docs]) {
    const memberId = (doc.data() as { memberId?: string | null }).memberId;
    if (!memberId) continue;
    countByMember.set(memberId, (countByMember.get(memberId) ?? 0) + 1);
  }

  const suspects = [...countByMember.entries()].filter(([, count]) => count >= REVIEW_VELOCITY_THRESHOLD);
  if (!suspects.length) return { checked: countByMember.size, flagged: 0 };

  const adminIds = await getAdminIdsWithPermission("reviews");
  if (!adminIds.length) return { checked: countByMember.size, flagged: 0 };

  let flagged = 0;
  for (const [memberId, count] of suspects) {
    const memberSnap = await db.collection("members").doc(memberId).get();
    const member = memberSnap.data() as { name?: string; email?: string } | undefined;
    await notifyAdmins(adminIds, {
      type: "review_velocity_flag",
      title: `Unusual review activity: ${member?.name ?? "a member"}`,
      body: `${member?.email ?? memberId} posted ${count} reviews in the last 24 hours — worth a manual look before assuming they're genuine.`,
      link: "/admin/reviews",
    }).catch((error) => console.error("Review-velocity flag notification failed", error));
    flagged++;
  }
  return { checked: countByMember.size, flagged };
}

const RENEWAL_REMINDER_LEAD_MS = 3 * 24 * 60 * 60 * 1000;
const RENEWAL_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Daily-gated sweep: the proactive counterpart to sendDunningNotice (the razorpay webhook's
 * reactive "your renewal already failed" notice) — this reaches a member ~3 days *before* the
 * charge, while there's still time to update a card that's about to expire. Firestore range
 * queries can't do "search a window that itself slides forward every day" as one clause, so this
 * checks the [now+3d, now+4d) window and relies on the sweep's own daily cadence to slide it. */
export async function sendRenewalReminders() {
  if (!(await shouldRunNow("renewal-reminder-sweep", 20 * 60 * 60 * 1000))) return { skipped: true as const };

  const now = Date.now();
  const windowStart = new Date(now + RENEWAL_REMINDER_LEAD_MS);
  const windowEnd = new Date(now + RENEWAL_REMINDER_LEAD_MS + RENEWAL_REMINDER_WINDOW_MS);
  const snap = await withIndexFallback(
    () => db.collection("memberSubscriptions").where("status", "==", "active").where("currentPeriodEnd", ">=", windowStart).where("currentPeriodEnd", "<=", windowEnd).get(),
    { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] } as FirebaseFirestore.QuerySnapshot,
  );

  const billingUrl = new URL("/dashboard/billing", getSiteUrl()).toString();
  let sent = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { renewalReminderSentAt?: FirebaseFirestore.Timestamp; currentPeriodEnd?: FirebaseFirestore.Timestamp; planId?: string };
    if (data.renewalReminderSentAt) continue;

    const memberSnap = await db.collection("members").doc(doc.id).get();
    const member = memberSnap.data() as { email?: string; name?: string } | undefined;
    if (!member?.email) continue;

    const plan = data.planId ? await getPlanById(data.planId) : null;
    const renewDate = data.currentPeriodEnd?.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "long" });

    await sendEmail({
      to: member.email,
      subject: "Your membership renews soon",
      html: genericNotificationEmailHtml({
        title: "Your membership renews soon",
        name: member.name ?? "there",
        body: `Your ${plan?.name ?? "membership"} renews on ${renewDate ?? "your next billing date"}. If your payment details are current, there's nothing to do — otherwise update them now to avoid an interruption.`,
        ctaLabel: "Review billing",
        ctaUrl: billingUrl,
      }),
    }).catch((error) => console.error("Renewal reminder email failed", error));

    await doc.ref.update({ renewalReminderSentAt: FieldValue.serverTimestamp() });
    sent++;
  }
  return { checked: snap.docs.length, sent };
}

const CHURN_PRIOR_WINDOW_MS = 120 * 24 * 60 * 60 * 1000;
const CHURN_RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CHURN_MIN_PRIOR_BOOKINGS = 2;
const CHURN_NUDGE_COOLDOWN_MS = 45 * 24 * 60 * 60 * 1000;

/** Weekly-gated sweep: an earlier, narrower signal than sendWinBackEmails (which only fires 30
 * days after someone stops *logging in* at all). This looks specifically at booking behavior — a
 * member who used to book regularly (2+ sessions 30-120 days ago) but has booked nothing in the
 * last 30 days is a warmer, more specific churn signal than blanket inactivity, and can be caught
 * before they've gone fully quiet. Scans a single-range-field window in memory (bookings only
 * carry clientEmail, not memberId) rather than needing a new composite index or schema field. */
export async function flagEarlyChurnRisk() {
  if (!(await shouldRunNow("churn-early-warning-sweep", 6 * 24 * 60 * 60 * 1000))) return { skipped: true as const };

  const now = Date.now();
  const priorStart = now - CHURN_PRIOR_WINDOW_MS;
  const priorEnd = now - CHURN_RECENT_WINDOW_MS;
  const snap = await db.collection("bookings").where("scheduledAt", ">=", new Date(priorStart)).get();

  const priorCounts = new Map<string, number>();
  const hasRecent = new Set<string>();
  for (const doc of snap.docs) {
    const data = doc.data() as { clientEmail?: string; scheduledAt?: FirebaseFirestore.Timestamp; status?: string };
    if (!data.clientEmail || data.status === "cancelled" || !data.scheduledAt) continue;
    const t = data.scheduledAt.toMillis();
    if (t >= priorStart && t < priorEnd) priorCounts.set(data.clientEmail, (priorCounts.get(data.clientEmail) ?? 0) + 1);
    else if (t >= priorEnd) hasRecent.add(data.clientEmail);
  }

  const atRisk = [...priorCounts.entries()].filter(([email, count]) => count >= CHURN_MIN_PRIOR_BOOKINGS && !hasRecent.has(email));
  let sent = 0;
  for (const [email] of atRisk) {
    const memberSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (memberSnap.empty) continue;
    const memberDoc = memberSnap.docs[0];
    const member = memberDoc.data() as { name?: string; lastChurnNudgeSentAt?: FirebaseFirestore.Timestamp; isDemoAccount?: boolean };
    if (member.isDemoAccount) continue;
    if (member.lastChurnNudgeSentAt && Date.now() - member.lastChurnNudgeSentAt.toMillis() < CHURN_NUDGE_COOLDOWN_MS) continue;

    await sendEmail({
      to: email,
      subject: "It's been quiet since your last reading",
      html: genericNotificationEmailHtml({
        title: "We noticed you've slowed down",
        name: member.name ?? "there",
        body: "You used to book with us regularly, and it's been a while since your last session. Your chart hasn't changed, but the sky — and your transits — have. Worth another look.",
        ctaLabel: "Book a reading",
        ctaUrl: new URL("/book", getSiteUrl()).toString(),
      }),
    }).catch((error) => console.error("Churn nudge email failed", error));

    await memberDoc.ref.update({ lastChurnNudgeSentAt: FieldValue.serverTimestamp() });
    sent++;
  }
  return { checked: priorCounts.size, atRisk: atRisk.length, sent };
}

const ONBOARDING_DRIP_STEPS = [
  {
    key: "day1",
    afterMs: 1 * 24 * 60 * 60 * 1000,
    subject: "Getting the most from your birth chart",
    title: "A quick start guide",
    body: "If you haven't already, complete your birth profile — that's what powers your real Kundli, Cosmic Weather, and lucky numbers. From there, your dashboard fills in automatically.",
  },
  {
    key: "day3",
    afterMs: 3 * 24 * 60 * 60 * 1000,
    subject: "Have you asked your first free question yet?",
    title: "One free live reading is waiting",
    body: "Every new member gets one free live reading — ask a specific question about work, relationships, or timing and get a real answer, not a generic horoscope.",
  },
  {
    key: "day7",
    afterMs: 7 * 24 * 60 * 60 * 1000,
    subject: "One week in — a few things members love",
    title: "You've been with us a week",
    body: "A few things worth trying: the Astro Journal (tracks your mood against real transits), inviting a friend for wallet credit, and the gemstone recommender if you're curious about remedies.",
  },
] as const;

/** Daily-gated sweep: a member who never returns to the dashboard never sees the on-page
 * first-steps card (dashboard-onboarding section) — this reaches them by email instead, on a
 * fixed schedule from signup, each step sent exactly once via the onboardingDripSent array. */
export async function sendOnboardingDrip() {
  if (!(await shouldRunNow("onboarding-drip-sweep", 20 * 60 * 60 * 1000))) return { skipped: true as const };

  const cutoff = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const snap = await db.collection("members").where("createdAt", ">=", cutoff).get();
  const dashboardUrl = new URL("/dashboard", getSiteUrl()).toString();

  let sent = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as { email?: string; name?: string; createdAt?: FirebaseFirestore.Timestamp; isDemoAccount?: boolean; onboardingDripSent?: string[] };
    if (!data.email || data.isDemoAccount || !data.createdAt) continue;
    const alreadySent = new Set(data.onboardingDripSent ?? []);
    const age = Date.now() - data.createdAt.toMillis();

    for (const step of ONBOARDING_DRIP_STEPS) {
      if (age < step.afterMs || alreadySent.has(step.key)) continue;
      await sendEmail({
        to: data.email,
        subject: step.subject,
        html: genericNotificationEmailHtml({ title: step.title, name: data.name ?? "there", body: step.body, ctaLabel: "Open your dashboard", ctaUrl: dashboardUrl }),
      }).catch((error) => console.error("Onboarding drip email failed", error));
      await doc.ref.update({ onboardingDripSent: FieldValue.arrayUnion(step.key) });
      alreadySent.add(step.key);
      sent++;
    }
  }
  return { checked: snap.size, sent };
}

const DIGEST_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DIGEST_COOLDOWN_MS = 20 * 60 * 60 * 1000;
const DIGEST_MIN_ITEMS = 2;

/** Daily-gated sweep: bundles a member's unread notifications from the last 24h into one email
 * instead of each automation (dunning, review requests, wishlist alerts, ...) sending its own —
 * only fires for members with 2+ unread items so a single notification still reaches them
 * immediately via its own send, this just catches the pile-up case. */
export async function sendNotificationDigest() {
  if (!(await shouldRunNow("notification-digest-sweep", DIGEST_COOLDOWN_MS))) return { skipped: true as const };

  const windowStart = new Date(Date.now() - DIGEST_LOOKBACK_MS);
  const snap = await db.collection("notifications").where("recipientType", "==", "member").where("createdAt", ">=", windowStart).get();

  const byMember = new Map<string, string[]>();
  for (const doc of snap.docs) {
    const data = doc.data() as { recipientId: string; title: string; readAt?: unknown };
    if (data.readAt) continue;
    const list = byMember.get(data.recipientId) ?? [];
    list.push(data.title);
    byMember.set(data.recipientId, list);
  }

  let sent = 0;
  for (const [memberId, titles] of byMember.entries()) {
    if (titles.length < DIGEST_MIN_ITEMS) continue;
    const memberRef = db.collection("members").doc(memberId);
    const memberSnap = await memberRef.get();
    const member = memberSnap.data() as { email?: string; name?: string; lastDigestSentAt?: FirebaseFirestore.Timestamp; isDemoAccount?: boolean } | undefined;
    if (!member?.email || member.isDemoAccount) continue;
    if (member.lastDigestSentAt && Date.now() - member.lastDigestSentAt.toMillis() < DIGEST_COOLDOWN_MS) continue;

    const summary = titles.slice(0, 8).join(" · ");
    await sendEmail({
      to: member.email,
      subject: `${titles.length} updates waiting for you`,
      html: genericNotificationEmailHtml({
        title: "Your updates from the last day",
        name: member.name ?? "there",
        body: `You have ${titles.length} unread update${titles.length === 1 ? "" : "s"}: ${summary}.`,
        ctaLabel: "View all",
        ctaUrl: new URL("/dashboard", getSiteUrl()).toString(),
      }),
    }).catch((error) => console.error("Notification digest email failed", error));

    await memberRef.update({ lastDigestSentAt: FieldValue.serverTimestamp() });
    sent++;
  }
  return { checked: byMember.size, sent };
}

const CANCELLATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CANCELLATION_RATE_THRESHOLD = 0.3;
const CANCELLATION_MIN_SAMPLE = 5;

/** Daily-gated sweep: a practitioner whose cancellation rate spikes is a quality signal worth
 * catching automatically rather than waiting for a member to complain. Requires a minimum sample
 * size (5 bookings in the trailing 30 days) so one or two cancellations out of a handful of
 * bookings doesn't trigger a false alarm. */
export async function flagPractitionerCancellationSpikes() {
  if (!(await shouldRunNow("cancellation-anomaly-sweep", 24 * 60 * 60 * 1000))) return { skipped: true as const };

  const windowStart = new Date(Date.now() - CANCELLATION_WINDOW_MS);
  const snap = await db.collection("bookings").where("scheduledAt", ">=", windowStart).get();

  const totalsByPractitioner = new Map<string, { total: number; cancelled: number }>();
  for (const doc of snap.docs) {
    const data = doc.data() as { practitionerId?: string | null; status?: string };
    if (!data.practitionerId) continue;
    const entry = totalsByPractitioner.get(data.practitionerId) ?? { total: 0, cancelled: 0 };
    entry.total++;
    if (data.status === "cancelled") entry.cancelled++;
    totalsByPractitioner.set(data.practitionerId, entry);
  }

  const flagged = [...totalsByPractitioner.entries()].filter(([, stats]) => stats.total >= CANCELLATION_MIN_SAMPLE && stats.cancelled / stats.total >= CANCELLATION_RATE_THRESHOLD);
  if (!flagged.length) return { checked: totalsByPractitioner.size, flagged: 0 };

  const adminIds = await getAdminIdsWithPermission("practitioners");
  if (!adminIds.length) return { checked: totalsByPractitioner.size, flagged: 0 };

  let notified = 0;
  for (const [practitionerId, stats] of flagged) {
    const practitionerSnap = await db.collection("practitioners").doc(practitionerId).get();
    const practitioner = practitionerSnap.data() as { name?: string } | undefined;
    const rate = Math.round((stats.cancelled / stats.total) * 100);
    await notifyAdmins(adminIds, {
      type: "cancellation_rate_flag",
      title: `High cancellation rate: ${practitioner?.name ?? "a practitioner"}`,
      body: `${rate}% of their last ${stats.total} bookings were cancelled in the past 30 days — worth a look.`,
      link: "/admin/practitioners",
    }).catch((error) => console.error("Cancellation anomaly notification failed", error));
    notified++;
  }
  return { checked: totalsByPractitioner.size, flagged: notified };
}

/** Monthly-gated sweep: emails admins a plain-language GST/revenue summary for the prior calendar
 * month, pulled from paid booking invoices and subscription invoices (both already carry
 * subtotal/taxAmount from splitGstInclusive). Filters status in memory rather than in the query
 * so this doesn't need two new composite indexes for a job that runs once a month. */
export async function sendMonthlyGstSummary() {
  if (!(await shouldRunNow("gst-summary-sweep", 20 * 24 * 60 * 60 * 1000))) return { skipped: true as const };

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [bookingInvoicesSnap, subscriptionInvoicesSnap] = await Promise.all([
    db.collection("invoices").where("paidAt", ">=", monthStart).where("paidAt", "<", monthEnd).get(),
    db.collection("subscriptionInvoices").where("createdAt", ">=", monthStart).where("createdAt", "<", monthEnd).get(),
  ]);

  let subtotal = 0;
  let taxAmount = 0;
  let total = 0;
  let count = 0;
  for (const doc of [...bookingInvoicesSnap.docs, ...subscriptionInvoicesSnap.docs]) {
    const data = doc.data() as { status?: string; subtotal?: number; taxAmount?: number; amount?: number };
    if (data.status !== "paid") continue;
    subtotal += data.subtotal ?? 0;
    taxAmount += data.taxAmount ?? 0;
    total += data.amount ?? 0;
    count++;
  }

  const adminIds = await getAdminIdsWithPermission("billing");
  if (!adminIds.length || count === 0) return { checked: bookingInvoicesSnap.size + subscriptionInvoicesSnap.size, sent: 0 };

  const adminDocs = await db.getAll(...adminIds.map((id) => db.collection("adminUsers").doc(id)));
  const adminEmails = adminDocs.map((doc) => (doc.data() as { email?: string } | undefined)?.email).filter((email): email is string => Boolean(email));
  const monthLabel = monthStart.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  let sent = 0;
  for (const email of adminEmails) {
    await sendEmail({
      to: email,
      subject: `GST summary — ${monthLabel}`,
      html: genericNotificationEmailHtml({
        title: `${monthLabel} revenue & GST summary`,
        name: "there",
        body: `${count} paid invoices: ₹${subtotal} subtotal, ₹${taxAmount} GST collected, ₹${total} total. Full line-item detail is in the admin billing dashboard.`,
        ctaLabel: "Open billing",
        ctaUrl: new URL("/admin/billing", getSiteUrl()).toString(),
      }),
    }).catch((error) => console.error("GST summary email failed", error));
    sent++;
  }
  return { checked: count, sent };
}
