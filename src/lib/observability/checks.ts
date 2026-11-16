// The site's own watchdog: given a snapshot of what the background jobs and settings look like
// right now, which problems need the owner. Pure, so every rule is tested without a database.
// Keys are stable (they name the alert and limit it to one email a day); titles and fixes are
// written for the owner, who is not technical.
import type { AutomationMode } from "@/lib/automation/registry";

export type JobRun = { at: string; ok: boolean; summary?: string } | null;

export type Snapshot = {
  /** Can the site reach its database at all? */
  db: boolean;
  /** Every registered job with its switch position and last recorded run. */
  jobs: { key: string; label: string; mode: AutomationMode; last: JobRun }[];
  settings: {
    production: boolean;
    cronSecret: boolean;
    alertEmail: boolean;
    email: boolean;
    razorpay: boolean;
    razorpayWebhookSecret: boolean;
    /** ALLOW_PAYMENT_BYPASS or ALLOW_FREE_AI_READINGS set to "true". */
    testBypass: string[];
  };
  /** Today's AI call allowance is used up, so paid AI readings are refusing new orders. */
  aiCapSpent: boolean;
};

export type Problem = { key: string; title: string; detail: string; fix: string };

const HOUR = 3_600_000;
/** A once-a-day job counts as missed after 26 hours (a day plus slack for a slow run). */
export const STALE_AFTER = 26 * HOUR;

const hoursAgo = (iso: string, now: Date) => Math.round((now.getTime() - Date.parse(iso)) / HOUR);

function jobProblems(job: Snapshot["jobs"][number], now: Date): Problem[] {
  if (job.mode === "off") return [];
  const fix = "Check Vercel → Cron Jobs for /api/cron/daily, and that CRON_SECRET is set in Vercel.";
  const run = job.last;
  if (!run) return [{ key: `${job.key}-missing`, title: `${job.label} is switched on but has never run`, detail: "There is no record of it running.", fix }];
  if (now.getTime() - Date.parse(run.at) > STALE_AFTER)
    return [{ key: `${job.key}-stale`, title: `${job.label} didn't run`, detail: `Last run was ${hoursAgo(run.at, now)} hours ago; it should run every day.`, fix }];
  if (!run.ok)
    return [{ key: `${job.key}-failed`, title: `${job.label} failed`, detail: `The last run (${hoursAgo(run.at, now)} h ago) stopped with an error after a retry: ${(run.summary ?? "").slice(0, 200)}`, fix: "It retries by itself in the evening. If this alert repeats tomorrow, send it to your developer." }];
  return [];
}

export function evaluate(s: Snapshot, now = new Date()): Problem[] {
  if (!s.db)
    return [
      {
        key: "db-down",
        title: "The website can't reach its database",
        detail: "Sign-in, payments, chats and every automatic job stop until it's back.",
        fix: "Check the Firebase console (Usage: the free daily read limit may be used up) or, after the move, the Supabase project page (it may be paused).",
      },
    ];
  const out: Problem[] = s.jobs.flatMap((j) => jobProblems(j, now));
  const st = s.settings;
  if (st.production && !st.cronSecret && s.jobs.some((j) => j.mode !== "off"))
    out.push({ key: "cron-secret-missing", title: "The daily schedule can't start", detail: "Jobs are switched on, but the schedule's password is not set, so the site refuses to run them.", fix: "Vercel → Settings → Environment Variables: add CRON_SECRET (any long random text), then redeploy." });
  if (st.production && st.testBypass.length)
    out.push({ key: "test-bypass-on", title: "A test-only setting is on in production", detail: `${st.testBypass.join(" and ")} let paid features run without payment.`, fix: "Vercel → Settings → Environment Variables: remove them from Production, then redeploy." });
  if (st.production && st.razorpay && !st.razorpayWebhookSecret)
    out.push({ key: "razorpay-webhook-secret-missing", title: "Razorpay can't confirm payments to the site", detail: "Someone who pays and closes the page before it finishes is charged and gets nothing.", fix: "Razorpay → Settings → Webhooks: point it at /api/webhooks/razorpay, and put the same secret in RAZORPAY_WEBHOOK_SECRET in Vercel." });
  if (st.production && !st.email)
    out.push({ key: "email-not-configured", title: "The site can't send email", detail: "Booking confirmations, receipts and these alerts are not going out.", fix: "Add RESEND_API_KEY in Vercel, then redeploy." });
  if (s.aiCapSpent)
    out.push({ key: "ai-cap-spent", title: "Today's AI reading allowance is used up", detail: "Paid AI readings and AI chats refuse new orders until midnight UTC, so no one is charged for an answer the site can't give.", fix: "If this is real demand, raise GEMINI_DAILY_CALL_LIMIT in Vercel. If sales don't explain it, tell your developer: something may be calling the AI in a loop." });
  return out;
}

/** What anyone may see at /api/status: whether it's healthy and which checks fail, no details. */
export const publicStatus = (problems: Problem[]) => ({ ok: problems.length === 0, failing: problems.map((p) => p.key) });

/** One line per problem for a digest email. */
export function healthLines(problems: Problem[]): string[] {
  return problems.length ? problems.map((p) => `${p.title}. ${p.fix}`) : ["All checks passed: scheduled jobs ran and the settings look right."];
}
