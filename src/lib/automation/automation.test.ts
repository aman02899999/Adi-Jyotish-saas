import { describe, expect, it, vi } from "vitest";
import { AUTOMATIONS, automationMode, indiaDate } from "./registry";
import { runAutomation } from "./run";
import type { RunRecord } from "./system-status";

const now = new Date("2026-11-16T01:30:00Z");

describe("automation switches", () => {
  it("keeps every job off until its own setting switches it on", () => {
    for (const a of AUTOMATIONS) {
      expect(automationMode(a.key, {})).toBe("off");
      expect(automationMode(a.key, { [a.switchEnv]: "yes" })).toBe("off");
      expect(automationMode(a.key, { [a.switchEnv]: "dry-run" })).toBe("dry-run");
      expect(automationMode(a.key, { [a.switchEnv]: " ON " })).toBe("on");
    }
  });

  it("stops everything with the one master switch", () => {
    for (const a of AUTOMATIONS) expect(automationMode(a.key, { [a.switchEnv]: "on", AUTOMATIONS: "off" })).toBe("off");
  });

  it("gives every job its own switch", () => {
    const names = AUTOMATIONS.map((a) => a.switchEnv);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^AUTOMATION_[A-Z_]+$/);
  });

  it("counts the day in India time", () => {
    expect(indiaDate(new Date("2026-11-15T18:29:00Z"))).toBe("2026-11-15");
    expect(indiaDate(new Date("2026-11-15T18:30:00Z"))).toBe("2026-11-16");
  });
});

describe("running a job", () => {
  const setup = () => {
    const rows: RunRecord[] = [];
    return { rows, record: async (r: RunRecord) => void rows.push(r) };
  };

  it("runs nothing and records nothing when switched off", async () => {
    const { rows, record } = setup();
    const job = vi.fn(async () => ({}));
    const out = await runAutomation("indexnow", job, { source: "cron", now, env: {}, record });
    expect(out.status).toBe("off");
    expect(job).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });

  it("tells the job it is a dry run, and records the run", async () => {
    const { rows, record } = setup();
    const job = vi.fn(async ({ dryRun }: { dryRun: boolean }) => ({ dryRun }));
    const out = await runAutomation("indexnow", job, { source: "cron", now, env: { AUTOMATION_INDEXNOW: "dry-run" }, record });
    expect(out).toMatchObject({ status: "ok", mode: "dry-run", attempts: 1 });
    expect(job).toHaveBeenCalledWith({ dryRun: true, now });
    expect(rows).toEqual([{ key: "indexnow", at: now.toISOString(), ok: true, mode: "dry-run", source: "cron", attempts: 1, summary: '{"dryRun":true}' }]);
  });

  it("tries a failed job once more before giving up, and records the failure", async () => {
    const { rows, record } = setup();
    const flaky = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({ submitted: 2 });
    expect(await runAutomation("indexnow", flaky, { source: "cron", now, env: { AUTOMATION_INDEXNOW: "on" }, record })).toMatchObject({ status: "ok", attempts: 2 });
    const broken = vi.fn().mockRejectedValue(new Error("HTTP 500"));
    expect(await runAutomation("indexnow", broken, { source: "cron", now, env: { AUTOMATION_INDEXNOW: "on" }, record })).toMatchObject({ status: "failed", attempts: 2, summary: "HTTP 500" });
    expect(broken).toHaveBeenCalledTimes(2);
    expect(rows.map((r) => r.ok)).toEqual([true, false]);
  });

  it("on the evening retry, skips what already succeeded today and redoes what failed", async () => {
    const { record } = setup();
    const env = { AUTOMATION_INDEXNOW: "on" };
    const evening = new Date("2026-11-16T13:30:00Z");
    const last = (ok: boolean, at = now.toISOString(), mode: RunRecord["mode"] = "on"): RunRecord => ({ key: "indexnow", at, ok, mode, source: "cron", attempts: 1, summary: "" });
    const job = vi.fn(async () => ({}));
    expect((await runAutomation("indexnow", job, { source: "retry", now: evening, env, record, last: last(true) })).status).toBe("skipped");
    expect(job).not.toHaveBeenCalled();
    expect((await runAutomation("indexnow", job, { source: "retry", now: evening, env, record, last: last(false) })).status).toBe("ok");
    expect((await runAutomation("indexnow", job, { source: "retry", now: evening, env, record, last: last(true, "2026-11-15T01:30:00Z") })).status).toBe("ok");
    // A dry run this morning doesn't count once the job is switched to real.
    expect((await runAutomation("indexnow", job, { source: "retry", now: evening, env, record, last: last(true, now.toISOString(), "dry-run") })).status).toBe("ok");
    expect((await runAutomation("indexnow", job, { source: "retry", now: evening, env, record, last: null })).status).toBe("ok");
  });
});
