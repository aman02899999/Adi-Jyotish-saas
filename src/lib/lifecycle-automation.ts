import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { sendEmail, genericNotificationEmailHtml } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { shouldRunNow } from "@/lib/automation-state";
import { FESTIVALS } from "@/lib/festivals";
import { getPromoBanner, updatePromoBanner } from "@/lib/promo-banner";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { notifyAdmins } from "@/lib/notifications";

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
