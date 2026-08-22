import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/member.json" });

/**
 * Same Razorpay-unconfigured boundary as wallet.spec.ts: verifies the pricing page correctly
 * reflects that memberships can't be purchased yet, rather than exposing a Subscribe button that
 * would silently fail against real payment credentials this suite doesn't have.
 */
test("pricing page lists plans and disables Subscribe until billing is configured", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText("Memberships open soon")).toBeVisible({ timeout: 15_000 });
  const subscribeButtons = page.getByRole("button", { name: /subscribe/i });
  const count = await subscribeButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await expect(subscribeButtons.nth(i)).toBeDisabled();
});
