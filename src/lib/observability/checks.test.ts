import { describe, expect, it } from "vitest";
import { evaluate, healthLines, publicStatus, type Snapshot } from "./checks";

const now = new Date("2026-11-16T03:00:00Z");
const healthy = (over: Partial<Snapshot> = {}, settings: Partial<Snapshot["settings"]> = {}): Snapshot => ({
  db: true,
  jobs: [{ key: "indexnow", label: "Search engine ping", mode: "on", last: { at: "2026-11-16T01:30:00Z", ok: true } }],
  settings: { production: true, cronSecret: true, alertEmail: true, email: true, razorpay: true, razorpayWebhookSecret: true, testBypass: [], ...settings },
  aiCapSpent: false,
  ...over,
});
const keys = (s: Snapshot) => evaluate(s, now).map((p) => p.key);
const job = (mode: Snapshot["jobs"][number]["mode"], last: Snapshot["jobs"][number]["last"]) => ({ jobs: [{ key: "indexnow", label: "Search engine ping", mode, last }] });

describe("watchdog rules", () => {
  it("reports nothing when everything is fine", () => {
    expect(evaluate(healthy(), now)).toEqual([]);
    expect(publicStatus([])).toEqual({ ok: true, failing: [] });
    expect(healthLines([])).toHaveLength(1);
  });

  it("reports only the outage when the database is down", () => {
    expect(keys(healthy({ db: false, aiCapSpent: true }))).toEqual(["db-down"]);
  });

  it("flags a switched-on job that never ran, ran late or failed", () => {
    expect(keys(healthy(job("on", null)))).toEqual(["indexnow-missing"]);
    expect(keys(healthy(job("dry-run", { at: "2026-11-14T01:30:00Z", ok: true })))).toEqual(["indexnow-stale"]);
    expect(keys(healthy(job("on", { at: "2026-11-16T01:30:00Z", ok: false, summary: "HTTP 500" })))).toEqual(["indexnow-failed"]);
  });

  it("says nothing about a job that is switched off", () => {
    expect(keys(healthy(job("off", null)))).toEqual([]);
    expect(keys(healthy(job("off", null), { cronSecret: false }))).toEqual([]);
  });

  it("flags settings that stop the schedule, payments or email in production", () => {
    expect(keys(healthy({}, { cronSecret: false }))).toEqual(["cron-secret-missing"]);
    expect(keys(healthy({}, { razorpayWebhookSecret: false }))).toEqual(["razorpay-webhook-secret-missing"]);
    expect(keys(healthy({}, { razorpay: false, razorpayWebhookSecret: false }))).toEqual([]);
    expect(keys(healthy({}, { email: false }))).toEqual(["email-not-configured"]);
  });

  it("flags a test-only payment bypass left on in production, and stays quiet on a preview", () => {
    expect(keys(healthy({}, { testBypass: ["ALLOW_PAYMENT_BYPASS"] }))).toEqual(["test-bypass-on"]);
    expect(keys(healthy({}, { production: false, testBypass: ["ALLOW_PAYMENT_BYPASS"], cronSecret: false, email: false }))).toEqual([]);
  });

  it("flags a used-up AI allowance", () => {
    expect(keys(healthy({ aiCapSpent: true }))).toEqual(["ai-cap-spent"]);
  });

  it("shows the public only which checks fail, never the details", () => {
    const problems = evaluate(healthy(job("on", { at: "2026-11-16T01:30:00Z", ok: false, summary: "secret detail" })), now);
    expect(JSON.stringify(publicStatus(problems))).toBe('{"ok":false,"failing":["indexnow-failed"]}');
  });
});
