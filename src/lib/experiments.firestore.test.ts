import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Experiment counters on the live Firestore path, which now shares its counting code with the
 * Postgres path. Runs against the Firestore emulator; see synthetic-reviews.firestore.test.ts.
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-jyotish";
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "true" && !EMULATOR) {
  throw new Error("REQUIRE_FIRESTORE_EMULATOR is set but FIRESTORE_EMULATOR_HOST is not — the emulator did not start.");
}
const describeFirestore = EMULATOR ? describe : describe.skip;

const { getExperimentReport, recordExperimentConversion, recordExperimentImpression } = await import("@/lib/experiments");

async function clearEmulator() {
  const response = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not clear the emulator: ${response.status}`);
}

describeFirestore("experiment counters on the live Firestore path", () => {
  beforeEach(clearEmulator);
  afterAll(clearEmulator);

  it("counts concurrent impressions and conversions per variant", async () => {
    await Promise.all(Array.from({ length: 12 }, () => recordExperimentImpression("dashboard-onboarding-cta", "control")));
    await recordExperimentConversion("dashboard-onboarding-cta", "control");
    await recordExperimentImpression("dashboard-onboarding-cta", "get-my-chart");

    const report = await getExperimentReport("dashboard-onboarding-cta");
    expect(report.variants).toEqual([
      { variant: "control", impressions: 12, conversions: 1, conversionRate: 1 / 12 },
      { variant: "get-my-chart", impressions: 1, conversions: 0, conversionRate: 0 },
    ]);
  });
});
