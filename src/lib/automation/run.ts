// Runs one background job under the house rules: its off switch is respected, a dry run never
// touches the outside world, a failure is tried once more, and every run leaves a record. The
// recorder is passed in so these rules are tested without a database.
import { automationMode, indiaDate, type AutomationKey, type AutomationMode } from "@/lib/automation/registry";
import type { RunRecord } from "@/lib/automation/system-status";

export type JobContext = { dryRun: boolean; now: Date };
/** A job returns a short summary of what it did (or, in a dry run, what it would have done). */
export type Job = (ctx: JobContext) => Promise<Record<string, unknown>>;

export type RunOutcome = { key: AutomationKey; status: "off" | "skipped" | "ok" | "failed"; mode: AutomationMode; attempts: number; summary: string };

type Options = {
  source: RunRecord["source"];
  now?: Date;
  env?: Record<string, string | undefined>;
  record: (run: RunRecord) => Promise<void>;
  /** The job's last recorded run, when known. A retry skips a job that already succeeded today. */
  last?: RunRecord | null;
  attempts?: number;
};

const MAX_ATTEMPTS = 2;

export async function runAutomation(key: AutomationKey, job: Job, opts: Options): Promise<RunOutcome> {
  const now = opts.now ?? new Date();
  const mode = automationMode(key, opts.env);
  if (mode === "off") return { key, status: "off", mode, attempts: 0, summary: "switched off" };
  // The evening retry is only for what the morning run didn't finish.
  if (opts.source === "retry" && opts.last?.ok && opts.last.mode === mode && indiaDate(new Date(opts.last.at)) === indiaDate(now))
    return { key, status: "skipped", mode, attempts: 0, summary: "already ran today" };

  const limit = Math.max(1, opts.attempts ?? MAX_ATTEMPTS);
  let error = "";
  for (let attempt = 1; attempt <= limit; attempt += 1) {
    try {
      const result = await job({ dryRun: mode === "dry-run", now });
      const summary = JSON.stringify(result).slice(0, 1500);
      await opts.record({ key, at: now.toISOString(), ok: true, mode, source: opts.source, attempts: attempt, summary });
      return { key, status: "ok", mode, attempts: attempt, summary };
    } catch (err) {
      error = (err as Error).message.slice(0, 300);
      console.error(`[automation] ${key} attempt ${attempt} failed:`, error);
    }
  }
  await opts.record({ key, at: now.toISOString(), ok: false, mode, source: opts.source, attempts: limit, summary: error });
  return { key, status: "failed", mode, attempts: limit, summary: error };
}
