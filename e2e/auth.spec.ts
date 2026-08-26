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

  test("signing out navigates away and clears the session", async ({ page }) => {
    // Sign-out posts a real <form> to /api/member/logout, which answers 303. Our CSP sets
    // `form-action 'self'` and Chrome checks every hop of a form submission against it, so an
    // absolute Location built from the server's own view of the request host lands on a different
    // origin than the page and the navigation is refused — leaving the user looking at a signed-in
    // page that has, in fact, already been signed out. That is invisible without a browser, so it
    // is asserted here: the URL must change, the header must flip back to signed-out, and no CSP
    // violation may be reported along the way.
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy/i.test(message.text())) violations.push(message.text());
    });

    const email = `e2e.signout.${Date.now()}@adijyotishgurus.test`;
    await page.goto("/account?mode=register");
    await page.getByLabel("Your name").fill("Sign Out Tester");
    await page.locator("input[type=email]").fill(email);
    await page.locator("input[type=password]").first().fill("UiTestPass123!");
    await page.locator("input[type=password]").nth(1).fill("UiTestPass123!");
    await page.getByRole("button", { name: /create my chart/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });

    // A brand-new account lands on /onboarding, which has no nav — the public header carries the
    // sign-out control, and its first-visit "what brings you here" prompt covers the page until
    // dismissed.
    await page.goto("/");
    await page.locator(".modal-backdrop").waitFor({ timeout: 10_000 }).catch(() => {});
    await page.keyboard.press("Escape");
    const signOut = page.locator('form[action="/api/member/logout"] button').first();
    await expect(signOut).toBeVisible({ timeout: 15_000 });
    await signOut.click();
    await expect(page).toHaveURL(/\/account/, { timeout: 15_000 });
    expect(violations, "sign-out must not trip a CSP violation").toEqual([]);

    const session = await page.evaluate(() => fetch("/api/member/session").then((response) => response.json()));
    expect(session.name).toBeNull();
  });
});
