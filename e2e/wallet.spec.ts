import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/member.json" });

/**
 * The emulator env has no RAZORPAY_TEST_KEY_ID/SECRET configured, matching how a fresh deploy
 * looks before someone adds real keys — so the correct, testable behavior here is "the recharge
 * button is disabled and the page says why", not "a recharge succeeds". If Razorpay ever becomes
 * configured in the E2E environment, this assertion is the one that should change first.
 */
test("wallet page shows the balance and disables recharge until Razorpay is configured", async ({ page }) => {
  await page.goto("/dashboard/wallet");
  await expect(page.getByText("Balance", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("small", { hasText: "Balance" }).locator("xpath=following-sibling::strong")).toContainText("INR");
  await expect(page.getByText("Recharge is temporarily unavailable")).toBeVisible();
  const addFundsButton = page.getByRole("button", { name: /add inr/i });
  await expect(addFundsButton).toBeDisabled();
});
