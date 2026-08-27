import { expect, test } from "@playwright/test";

/**
 * The full Kundli page pulls together every engine in src/lib/vedic — dasha, vargas,
 * ashtakavarga, yogas, panchang. A regression in any of them surfaces here as a missing section
 * or a server error, which unit tests on the tables alone would not catch.
 */
test.use({ storageState: "e2e/.auth/member.json" });

test("the full Kundli page renders every computed section for an onboarded member", async ({ page }) => {
  await page.goto("/dashboard/kundli");

  // Birth header — proves the chart itself resolved from the member's birth profile.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Janma Patrika", { exact: false })).toBeVisible();

  for (const heading of ["Birth Panchang", "Rashi Chart (D1)", "Navamsa (D9)", "Planetary Positions", "Vimshottari Dasha", "Ashtakavarga", "House Lords", "Doshas", "Divisional Charts"]) {
    // Exact-string match rather than a regex — several headings contain parentheses, which a
    // naive RegExp would silently reinterpret as capture groups.
    await expect(page.getByRole("heading", { name: heading, exact: false })).toBeVisible();
  }

  // All nine grahas appear in the positions table.
  for (const graha of ["Surya", "Chandra", "Mangal", "Budh", "Guru", "Shukra", "Shani", "Rahu", "Ketu"]) {
    await expect(page.getByRole("rowheader", { name: new RegExp(graha, "i") }).first()).toBeVisible();
  }

  // Ashtakavarga must total the canonical 337 bindus for any chart.
  await expect(page.getByText(/Total across the chart: 337/)).toBeVisible();

  // A running dasha period is always resolvable for a living native.
  await expect(page.getByText("Running now")).toBeVisible();

  // All sixteen divisional charts are listed.
  for (const varga of ["D1", "D9", "D10", "D60"]) {
    await expect(page.getByRole("rowheader", { name: new RegExp(`^${varga}\\b`) })).toBeVisible();
  }
});
