import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runDailyAutomations } from "@/lib/automation/jobs";
import { runWatchdog } from "@/lib/observability/watchdog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The daily schedule (vercel.json) calls this with "Authorization: Bearer $CRON_SECRET": once in
// the morning, and once in the evening with ?retry=1, which only redoes what the morning run did
// not finish. Without CRON_SECRET it refuses to run in production. Every job here is off until its
// own setting switches it on (src/lib/automation/registry.ts), so merging this changes nothing by
// itself. The health check runs last, so a job that just failed is reported the same day.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const retry = new URL(req.url).searchParams.get("retry") === "1";
  const jobs = await runDailyAutomations(retry ? "retry" : "cron");
  const health = await runWatchdog().then(
    (w) => ({ failing: w.problems.map((p) => p.key), alerted: w.alerted }),
    (err: Error) => ({ error: err.message.slice(0, 200) }),
  );
  const ok = jobs.every((j) => j.status !== "failed");
  return NextResponse.json({ ok, jobs, health }, { status: ok ? 200 : 500, headers: { "cache-control": "no-store" } });
}
