import "server-only";

import { genericNotificationEmailHtml, isEmailConfigured, sendEmail } from "@/lib/email";
import { isDailyGeminiCapSpent } from "@/lib/gemini";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { getSiteUrl } from "@/lib/site-url";
import { AUTOMATIONS, automationMode, indiaDate } from "@/lib/automation/registry";
import { claimOnce, latestRuns, type RunRecord } from "@/lib/automation/system-status";
import { evaluate, type Problem, type Snapshot } from "@/lib/observability/checks";

// Reads what the background jobs did and which settings are present (names only, never values, and
// no member data), then emails the owner about anything wrong, once per problem per India day.

export async function snapshot(env: Record<string, string | undefined> = process.env): Promise<Snapshot> {
  let db = true;
  let runs: Record<string, RunRecord | null> = {};
  try {
    runs = await latestRuns(AUTOMATIONS.map((a) => a.key));
  } catch (err) {
    console.error("[watchdog] database read failed:", (err as Error).message);
    db = false;
  }
  return {
    db,
    jobs: AUTOMATIONS.map((a) => ({ key: a.key, label: a.label, mode: automationMode(a.key, env), last: runs[a.key] ?? null })),
    settings: {
      production: env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production",
      cronSecret: Boolean(env.CRON_SECRET),
      alertEmail: Boolean(env.ALERT_EMAIL),
      email: isEmailConfigured(),
      razorpay: isRazorpayConfigured(),
      razorpayWebhookSecret: Boolean(env.RAZORPAY_WEBHOOK_SECRET?.trim()),
      testBypass: ["ALLOW_PAYMENT_BYPASS", "ALLOW_FREE_AI_READINGS"].filter((k) => env[k] === "true"),
    },
    // Reads as "not spent" when the count can't be read, so it never raises a false alarm.
    aiCapSpent: db ? await isDailyGeminiCapSpent().catch(() => false) : false,
  };
}

/**
 * Checks everything and alerts the owner about new problems. Safe to call often: each problem is
 * emailed once per India day. Only the owner's alert address (ALERT_EMAIL) is ever written to;
 * no customer receives anything from here.
 */
export async function runWatchdog(now = new Date()): Promise<{ problems: Problem[]; alerted: string[] }> {
  const problems = evaluate(await snapshot(), now);
  for (const p of problems) console.error(`[watchdog] ${p.key}: ${p.title}`);
  const to = process.env.ALERT_EMAIL;
  // With the database down there is nowhere to record "already alerted"; the uptime check outside
  // the host (which fails on a 503 from /api/status) is what raises the alarm then.
  if (!to || !isEmailConfigured() || !problems.length || problems[0].key === "db-down") return { problems, alerted: [] };
  const date = indiaDate(now);
  const alerted: string[] = [];
  for (const p of problems) {
    try {
      if (!(await claimOnce(`alert:${p.key}:${date}`))) continue;
      const { sent } = await sendEmail({
        to,
        subject: `Site alert: ${p.title}`.slice(0, 200),
        html: genericNotificationEmailHtml({ title: p.title, name: "Admin", body: `${p.detail} What to do: ${p.fix} This alert repeats once a day until it's fixed.`, ctaLabel: "Open the admin", ctaUrl: new URL("/admin", getSiteUrl()).toString() }),
      });
      if (sent) alerted.push(p.key);
    } catch (err) {
      console.error("[watchdog] alert failed:", (err as Error).message);
    }
  }
  return { problems, alerted };
}
