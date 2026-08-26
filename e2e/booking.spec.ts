import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/member.json" });

/**
 * Unlike gemstone checkout and subscriptions, booking a consultation never touches Razorpay
 * client-side — /api/bookings creates the reservation directly (see booking-flow.tsx's submit
 * handler) and billing is settled separately. That makes this the one money-path test that can
 * run all the way to a real, verifiable success state instead of stopping at "the payment button
 * is present."
 */
test("a member can complete the full 3-step booking flow to a confirmed reservation", async ({ page }) => {
  await page.goto("/book");

  // Step 1: choose a reading
  await expect(page.getByText("Choose your")).toBeVisible({ timeout: 15_000 });
  const firstService = page.locator(".booking-services > button").first();
  const serviceTitle = await firstService.locator("strong").innerText();
  await firstService.click();
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 2: birth details
  await expect(page.getByText("Map your")).toBeVisible();
  await page.locator("input[type=date]").fill("1994-06-15");
  await page.locator("input[type=time]").fill("07:45");
  await page.getByPlaceholder("Start typing a city…").fill("Jaipur, India");
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 3: pick astrologer + time, then reserve
  await expect(page.getByRole("heading", { name: /choose your/i })).toBeVisible();
  await expect(page.locator(".availability-loading")).toHaveCount(0, { timeout: 15_000 });
  const availablePractitioner = page.locator(".practitioner-options button:not([disabled])").first();
  await expect(availablePractitioner).toBeVisible({ timeout: 15_000 });
  await availablePractitioner.click();

  const firstSlot = page.locator(".time-slots button").first();
  await expect(firstSlot).toBeVisible({ timeout: 15_000 });
  await firstSlot.click();

  await page.getByRole("button", { name: /reserve consultation/i }).click();

  await expect(page.getByText("Your place is reserved")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".booking-receipt")).toContainText(serviceTitle);
});
