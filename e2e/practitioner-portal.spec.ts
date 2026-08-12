import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/practitioner.json" });

/**
 * Read-only on purpose: this suite's demo practitioner is kept always-available (see
 * global-setup / the seeded availabilityRules) so booking.spec.ts can always find an open slot.
 * Toggling schedule state here would race that assumption since Playwright runs these spec files
 * sequentially in one worker, so this only verifies the portal renders live data correctly.
 */
test("practitioner overview and bookings list load with the demo profile's data", async ({ page }) => {
  await page.goto("/practitioner");
  await expect(page.getByText(/welcome back/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Available to withdraw")).toBeVisible();

  await page.goto("/practitioner/bookings");
  await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeVisible();
});
