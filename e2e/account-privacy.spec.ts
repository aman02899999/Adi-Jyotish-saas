import { test, expect } from "@playwright/test";

/**
 * Self-service privacy rights (data export + account deletion) on /dashboard/security.
 * Deliberately does NOT reuse the shared member fixture from global-setup — deletion is
 * destructive, so this spec registers its own throwaway member through the real UI and
 * destroys only that.
 */
test.describe("account privacy controls", () => {
  test("a member can download their data and permanently delete their account", async ({ page }) => {
    const email = `e2e.privacy.${Date.now()}@adijyotishgurus.test`;

    // Register a dedicated member through the real form.
    await page.goto("/account?mode=register");
    await page.getByLabel("Your name").fill("Privacy Tester");
    await page.locator("input[type=email]").fill(email);
    await page.locator("input[type=password]").first().fill("PrivacyPass123!");
    await page.locator("input[type=password]").nth(1).fill("PrivacyPass123!");
    await page.getByRole("button", { name: /create my chart/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });

    // A brand-new member lands on /onboarding, and DashboardLayout bounces anyone with an
    // incomplete birth profile back there — complete onboarding the same way global-setup does
    // (the real profile API, sharing this page's session cookies) so /dashboard/security renders.
    const onboardRes = await page.request.put("/api/member/profile", {
      headers: { origin: new URL(page.url()).origin },
      data: { birthDate: "1994-06-15", birthTime: "07:45", birthPlace: "Jaipur, India" },
    });
    expect(onboardRes.ok()).toBe(true);

    await page.goto("/dashboard/security");
    await expect(page.getByRole("heading", { name: "Download your data" })).toBeVisible({ timeout: 15_000 });

    // Export: a real file download whose JSON bundle identifies this member.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: /download my data/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/adi-jyotish-data-export-.*\.json/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bundle = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
      format: string;
      profile: { email?: string; totpSecret?: unknown } | null;
    };
    expect(bundle.format).toBe("adi-jyotish-guru/member-data-export.v1");
    expect(bundle.profile?.email).toBe(email);
    // TOTP material must never leave the server, even for the account's own export.
    expect(bundle.profile).not.toHaveProperty("totpSecret");

    // Deletion: typed confirmation gates the button; completing it signs the member out.
    await page.getByRole("button", { name: /delete my account/i }).click();
    const confirmButton = page.getByRole("button", { name: /permanently delete my account/i });
    await expect(confirmButton).toBeDisabled();
    await page.getByPlaceholder("DELETE").fill("DELETE");
    await expect(confirmButton).toBeEnabled();
    // Signed-in members carry the NEXT_LOCALE=hi cookie, so "/" may land on "/hi" — assert on
    // the notice param, not the exact path.
    await confirmButton.click();
    await expect(page).toHaveURL(/notice=account-deleted/, { timeout: 20_000 });

    // The session is dead: a protected page bounces to sign-in (renders nothing for a guest).
    await page.goto("/dashboard/security");
    await expect(page.getByRole("heading", { name: "Download your data" })).not.toBeVisible();

    // And the credentials no longer exist: signing in again fails at the auth layer.
    await page.goto("/account");
    await page.locator("input[type=email]").fill(email);
    await page.locator("input[type=password]").first().fill("PrivacyPass123!");
    await page.getByRole("button", { name: /open my dashboard/i }).click();
    await expect(page.locator("p.admin-auth-error")).toBeVisible({ timeout: 10_000 });
  });
});
