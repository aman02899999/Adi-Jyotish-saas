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
