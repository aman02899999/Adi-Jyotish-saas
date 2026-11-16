// Every background job the site can run by itself, in one list. Each has its own off switch, a
// dry-run mode that does the work without touching anything outside the site, and a record of
// every run (system-status.ts). Pure, so the rules are tested without a database.
//
// A job is controlled by one setting, AUTOMATION_<KEY> (for example AUTOMATION_INDEXNOW):
//   unset or "off"  nothing runs
//   "dry-run"       the job works out what it would do and records it; nothing is sent or posted
//   "on"            the job does it for real
// AUTOMATIONS=off stops every job at once, whatever the individual settings say.

export type AutomationKey = "indexnow";
export type AutomationMode = "off" | "dry-run" | "on";

export type Automation = {
  key: AutomationKey;
  /** Shown to the owner in alerts. */
  label: string;
  /** What it does, in the owner's words. */
  what: string;
  /** The setting that switches it. */
  switchEnv: string;
};

export const AUTOMATIONS: Automation[] = [
  {
    key: "indexnow",
    label: "Search engine ping",
    what: "Tells Bing and the AI search engines that read it which pages changed, so they don't wait for a crawl.",
    switchEnv: "AUTOMATION_INDEXNOW",
  },
];

type Env = Record<string, string | undefined>;

/** Off unless the setting says otherwise: a job nobody switched on never runs. */
export function automationMode(key: AutomationKey, env: Env = process.env): AutomationMode {
  if ((env.AUTOMATIONS ?? "").trim().toLowerCase() === "off") return "off";
  const job = AUTOMATIONS.find((a) => a.key === key);
  const value = (job ? env[job.switchEnv] ?? "" : "").trim().toLowerCase();
  return value === "on" || value === "dry-run" ? value : "off";
}

/** The date in India, the day every schedule and "once a day" rule on this site counts in. */
export function indiaDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
