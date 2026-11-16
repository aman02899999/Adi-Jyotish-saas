import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { isFirebaseConfigured } from "@/lib/firestore";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { publicStatus } from "@/lib/observability/checks";
import { runWatchdog } from "@/lib/observability/watchdog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The site's health check. The uptime workflow (.github/workflows/cron.yml, outside the host) calls
// it every hour and the daily schedule once a morning; each call emails the owner about any new
// problem (once per problem per day). It answers 503 only when the site itself is broken (no
// database), so the uptime check fails for an outage but not every hour for a problem the owner was
// already emailed about. The public answer names failing checks only; the scheduler
// (Authorization: Bearer $CRON_SECRET) also gets the details. /api/health stays the cheap
// "is the server up" probe that reads nothing.
type Body = ReturnType<typeof publicStatus>;
let last: { at: number; body: Body } | null = null;
// Anyone can call this and each fresh answer costs a few database reads, so public calls share one
// answer for ten minutes.
const PUBLIC_CACHE_MS = 10 * 60_000;
const httpStatus = (b: Body) => (b.failing.includes("db-down") || b.failing.includes("db-not-configured") ? 503 : 200);

export async function GET(req: Request) {
  if (!isSupabaseCutoverActive() && !isFirebaseConfigured()) return NextResponse.json({ ok: false, failing: ["db-not-configured"] }, { status: 503 });
  const scheduler = cronAuthorized(req, process.env, { allowUnsetInDev: false });
  if (!scheduler && last && Date.now() - last.at < PUBLIC_CACHE_MS) return NextResponse.json(last.body, { status: httpStatus(last.body) });
  const { problems, alerted } = await runWatchdog();
  const body = publicStatus(problems);
  last = { at: Date.now(), body };
  return NextResponse.json(scheduler ? { ...body, alerted, problems } : body, { status: httpStatus(body), headers: { "cache-control": "no-store" } });
}
