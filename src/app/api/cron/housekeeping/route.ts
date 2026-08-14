import { timingSafeEqual } from "node:crypto";
import { retryUnansweredReadings, sendPendingReadingReminders } from "@/lib/ai-readings";
import { expireStaleChatSessions } from "@/lib/chat";
import { expireStalePendingOrders, sendLowStockAlerts } from "@/lib/gemstone-orders";
import { sendPendingReviewRequests } from "@/lib/marketplace";
import {
  sendWinBackEmails,
  syncFestivalPromoBanner,
  sendPractitionerWeeklyDigest,
  flagReviewVelocityAbuse,
  sendRenewalReminders,
  flagEarlyChurnRisk,
  sendOnboardingDrip,
  sendNotificationDigest,
  flagPractitionerCancellationSpikes,
  sendMonthlyGstSummary,
} from "@/lib/lifecycle-automation";
import { sendGiftCardExpiryReminders } from "@/lib/gift-cards";

export const dynamic = "force-dynamic";

/** Runs the housekeeping sweeps that previously only fired lazily when a user happened to hit a
 * related endpoint (starting a chat, browsing gemstone orders) — meaning cleanup could sit stale
 * for hours on a quiet site. Meant to be called on a schedule (see .github/workflows/cron.yml)
 * rather than by end users, so it's gated by a shared secret instead of a user session.
 *
 * Daily/weekly/monthly-cadence sweeps ride along on this same 15-minute trigger rather than
 * needing their own workflow + secrets — each gates itself internally via shouldRunNow() so it
 * only does real work on its own schedule. */
function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const [
    chatResult,
    ordersResult,
    readingRemindersResult,
    unansweredReadingsResult,
    reviewRequestsResult,
    lowStockResult,
    winBackResult,
    festivalBannerResult,
    practitionerDigestResult,
    reviewVelocityResult,
    renewalReminderResult,
    churnRiskResult,
    onboardingDripResult,
    notificationDigestResult,
    cancellationSpikeResult,
    gstSummaryResult,
    giftCardExpiryResult,
  ] = await Promise.allSettled([
    expireStaleChatSessions(),
    expireStalePendingOrders(),
    sendPendingReadingReminders(),
    retryUnansweredReadings(),
    sendPendingReviewRequests(),
    sendLowStockAlerts(),
    sendWinBackEmails(),
    syncFestivalPromoBanner(),
    sendPractitionerWeeklyDigest(),
    flagReviewVelocityAbuse(),
    sendRenewalReminders(),
    flagEarlyChurnRisk(),
    sendOnboardingDrip(),
    sendNotificationDigest(),
    flagPractitionerCancellationSpikes(),
    sendMonthlyGstSummary(),
    sendGiftCardExpiryReminders(),
  ]);

  const asResult = (settled: PromiseSettledResult<unknown>) => (settled.status === "fulfilled" ? settled.value : String(settled.reason));

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    chatSessions: chatResult.status === "fulfilled" ? "ok" : String(chatResult.reason),
    pendingOrders: ordersResult.status === "fulfilled" ? "ok" : String(ordersResult.reason),
    readingReminders: asResult(readingRemindersResult),
    unansweredReadings: asResult(unansweredReadingsResult),
    reviewRequests: asResult(reviewRequestsResult),
    lowStockAlerts: asResult(lowStockResult),
    winBack: asResult(winBackResult),
    festivalBanner: asResult(festivalBannerResult),
    practitionerDigest: asResult(practitionerDigestResult),
    reviewVelocity: asResult(reviewVelocityResult),
    renewalReminders: asResult(renewalReminderResult),
    churnRisk: asResult(churnRiskResult),
    onboardingDrip: asResult(onboardingDripResult),
    notificationDigest: asResult(notificationDigestResult),
    cancellationSpikes: asResult(cancellationSpikeResult),
    gstSummary: asResult(gstSummaryResult),
    giftCardExpiry: asResult(giftCardExpiryResult),
  });
}
