import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every timed page rebuild is a billed write on the host and, here, a fresh set of database reads.
// On the owner's other site, hourly rebuilds of about 150 pages went over the free plan's monthly
// allowance once crawlers visited every page every hour. The pages listed below already rebuild
// hourly; this stops any new page joining them, and the list can only shrink. 0 (always dynamic)
// is fine.
const MIN_SECONDS = 6 * 60 * 60;
const APP = path.resolve(__dirname, "../app");
const HOURLY_TODAY = 9;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [full] : [];
  });
}

describe("timed rebuild budget", () => {
  it("adds no page that rebuilds more often than every 6 hours", () => {
    const tooOften: string[] = [];
    for (const file of walk(APP)) {
      const m = readFileSync(file, "utf8").match(/export const revalidate = ([^;]+);/);
      if (!m) continue;
      const seconds = Number(m[1].replace(/_/g, ""));
      if (seconds !== 0 && seconds < MIN_SECONDS) tooOften.push(`${path.relative(APP, file)}: ${m[1]}`);
    }
    expect(tooOften.length, `pages rebuilding more often than every 6 hours:\n${tooOften.join("\n")}`).toBeLessThanOrEqual(HOURLY_TODAY);
  });
});
