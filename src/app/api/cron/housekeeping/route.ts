import { timingSafeEqual } from "node:crypto";
import { retryUnansweredReadings, sendPendingReadingReminders } from "@/lib/ai-readings";
import { expireStaleChatSessions } from "@/lib/chat";
import { expireStalePendingOrders } from "@/lib/gemstone-orders";

export const dynamic = "force-dynamic";

/** Runs the housekeeping sweeps that previously only fired lazily when a user happened to hit a
 * related endpoint (starting a chat, browsing gemstone orders) — meaning cleanup could sit stale
 * for hours on a quiet site. Meant to be called on a schedule (see .github/workflows/cron.yml)
 * rather than by end users, so it's gated by a shared secret instead of a user session. */
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

  const [chatResult, ordersResult, readingRemindersResult, unansweredReadingsResult] = await Promise.allSettled([
    expireStaleChatSessions(),
    expireStalePendingOrders(),
    sendPendingReadingReminders(),
    retryUnansweredReadings(),
  ]);

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    chatSessions: chatResult.status === "fulfilled" ? "ok" : String(chatResult.reason),
    pendingOrders: ordersResult.status === "fulfilled" ? "ok" : String(ordersResult.reason),
    readingReminders: readingRemindersResult.status === "fulfilled" ? readingRemindersResult.value : String(readingRemindersResult.reason),
    unansweredReadings: unansweredReadingsResult.status === "fulfilled" ? unansweredReadingsResult.value : String(unansweredReadingsResult.reason),
  });
}
