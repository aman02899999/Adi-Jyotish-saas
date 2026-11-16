import "server-only";

import { getAllPosts } from "@/lib/blog";
import { indexNowUrls, submitIndexNow } from "@/lib/indexnow";
import { getSiteUrl } from "@/lib/site-url";
import { AUTOMATIONS, type AutomationKey } from "@/lib/automation/registry";
import { runAutomation, type Job, type RunOutcome } from "@/lib/automation/run";
import { latestRuns, recordRun, type RunRecord } from "@/lib/automation/system-status";

// What each job in the registry actually does. A new automation is one entry here and one in
// registry.ts; the off switch, dry run, retry and run record come with it.

const JOBS: Record<AutomationKey, Job> = {
  indexnow: async ({ dryRun, now }) => {
    // Monday in India.
    const monday = new Date(now.getTime() + 5.5 * 3_600_000).getUTCDay() === 1;
    const urls = indexNowUrls(getSiteUrl(), getAllPosts(), now, monday);
    if (dryRun) return { wouldSubmit: urls.length, sample: urls.slice(0, 12) };
    return { submitted: await submitIndexNow(urls) };
  },
};

/** Runs every registered job, one after another. A job that fails never stops the next one. */
export async function runDailyAutomations(source: RunRecord["source"], now = new Date()): Promise<RunOutcome[]> {
  const keys = AUTOMATIONS.map((a) => a.key);
  // On a retry, the last runs say what already succeeded today. If they can't be read, run everything.
  const last = source === "retry" ? await latestRuns(keys).catch(() => ({}) as Record<string, RunRecord | null>) : {};
  const out: RunOutcome[] = [];
  for (const key of keys) out.push(await runAutomation(key, JOBS[key], { source, now, record: recordRun, last: last[key] ?? null }));
  return out;
}
