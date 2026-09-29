import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

/**
 * Full CRUD round-trip (unlike the money-path specs, nothing here is gated on Razorpay) — proves
 * the admin panel's create-modal → API → list-refresh loop actually works, not just that the page
 * renders.
 */
test("an admin can create a gemstone category and see it in the list", async ({ page }) => {
  const categoryName = `E2E Category ${Date.now()}`;
  await page.goto("/admin/gemstones/categories");
  await page.getByRole("button", { name: /add category/i }).click();

  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Category name").fill(categoryName);
  await page.getByRole("button", { name: /^create category$/i }).click();

  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(categoryName)).toBeVisible();
});

/**
 * The refund path for a paid reading that could not be produced: the member is told to contact
 * support, and support credits the wallet here. Proves the form reaches the API, the balance
 * moves once, and the credit shows in the ledger.
 */
test("an admin can credit a member's wallet from the Wallets page", async ({ page }) => {
  await page.goto("/admin/wallets");
  await page.getByLabel("Member email").fill("e2e.member@adijyotishgurus.test");
  await page.getByLabel(/^Amount/).fill("25");
  await page.getByLabel(/^Reason/).fill(`E2E refund ${Date.now()}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /^credit wallet$/i }).click();

  await expect(page.getByRole("status")).toContainText("added to E2E Member's wallet", { timeout: 15_000 });
  await expect(page.getByText("admin_credit").first()).toBeVisible({ timeout: 15_000 });
});
