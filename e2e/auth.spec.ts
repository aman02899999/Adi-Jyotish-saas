import { test, expect } from "@playwright/test";

/**
 * Member sign-up and sign-in through the real UI form (unlike global-setup, which drives the
 * same routes directly over HTTP to bootstrap fixtures fast) — this is the one spec that actually
 * exercises the login form markup and client-side Firebase Auth call, so a broken selector or a
 * broken createUserWithEmailAndPassword wiring fails here first.
 */
test.describe("member auth", () => {
  test("a new visitor can register and lands on the dashboard", async ({ page }) => {
    const email = `e2e.ui.${Date.now()}@adijyotishgurus.test`;
    await page.goto("/account?mode=register");
    await page.getByLabel("Your name").fill("UI Test Member");
    await page.locator("input[type=email]").fill(email);
    await page.locator("input[type=password]").first().fill("UiTestPass123!");
    await page.locator("input[type=password]").nth(1).fill("UiTestPass123!");
    await page.getByRole("button", { name: /create my chart/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
  });

  test("wrong password is rejected with an error, not a silent failure", async ({ page }) => {
    await page.goto("/account");
    await page.locator("input[type=email]").fill("nobody-e2e@adijyotishgurus.test");
    await page.locator("input[type=password]").first().fill("DefinitelyWrong123!");
    await page.getByRole("button", { name: /open my dashboard/i }).click();
    await expect(page.locator("p.admin-auth-error")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/account/);
  });
});
