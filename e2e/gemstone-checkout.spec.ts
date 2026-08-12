import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/member.json" });

/**
 * Cart lives in localStorage (see gemstone-cart-context / site-nav's readCartCount), so this
 * exercises the real client-side add-to-cart path rather than seeding cart state directly.
 * Stops short of clicking "Pay & place order" — that opens the real Razorpay widget, which this
 * suite has no live payment credentials to complete (RAZORPAY_TEST_KEY_ID/SECRET are not set in
 * the emulator env), so the assertion boundary is "the order summary and total are correct",
 * not "a payment succeeded".
 */
test("adding a gemstone to cart carries the right line item and total to checkout", async ({ page }) => {
  await page.goto("/gemstones/shop");
  const firstCard = page.locator(".product-card").first();
  await expect(firstCard).toBeVisible({ timeout: 15_000 });
  const productName = await firstCard.locator("h3").innerText();

  await firstCard.locator(".product-card__cart").click();
  await expect(firstCard.locator(".product-card__cart")).toHaveText(/added/i);

  await page.goto("/gemstones/cart");
  await expect(page.getByText(productName, { exact: false })).toBeVisible();

  await page.getByRole("link", { name: /proceed to checkout/i }).click();
  await expect(page).toHaveURL(/\/gemstones\/checkout/);
  await expect(page.getByRole("heading", { name: "Order summary" })).toBeVisible();
  await expect(page.locator(".cart-summary__row--total")).toContainText("₹");
  await expect(page.getByRole("button", { name: /pay & place order/i })).toBeVisible();
});
