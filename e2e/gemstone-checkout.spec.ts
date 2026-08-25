import { test, expect } from "@playwright/test";

/**
 * The gemstone storefront (shop/product/cart/checkout/compare) is intentionally offline while the
 * catalogue is finalized — see the comment atop src/app/[locale]/gemstones/page.tsx. Every route
 * under it redirects back to the coming-soon index, except /gemstones/recommend, the free AI
 * gemstone recommender, which stays live as a lead-gen tool independent of checkout being open.
 * This replaces the previous add-to-cart-through-checkout suite; swap it back once the store
 * reopens (see PR history for the last version that exercised the real cart/checkout flow).
 */
test("shop, product, cart, checkout, and compare all redirect to the coming-soon page", async ({ page }) => {
  for (const path of ["/gemstones/shop", "/gemstones/some-product", "/gemstones/cart", "/gemstones/checkout", "/gemstones/compare"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/gemstones$/);
    await expect(page.getByRole("heading", { name: /coming soon/i })).toBeVisible();
  }
});

test("the free gemstone recommender stays open while the store is coming soon", async ({ page }) => {
  await page.goto("/gemstones");
  await page.getByRole("link", { name: /get a (free|live) recommendation/i }).first().click();
  await expect(page).toHaveURL(/\/gemstones\/recommend/);
});
