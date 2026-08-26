import { expect, test } from "@playwright/test";

/**
 * Roster-wide integrity for the practitioner marketplace.
 *
 * The roster carries two pricing models — AI-powered practitioners bill a flat session price,
 * while the real practitioners bill per minute — and the profile page renders them from different
 * fields. A regression in either branch shows up as a profile that advertises a consultation
 * without ever naming its price, which is exactly what this catches.
 */

const REAL_PRACTITIONERS = ["arun-dubey-ji", "jagmohan-shashtri-ji"];

test("every listed practitioner has a profile that names its price", async ({ page }) => {
  await page.goto("/astrologers");

  const slugs = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll("a[href*='/astrologers/']")]
      .map((a) => a.getAttribute("href")!.split("/astrologers/")[1]?.split(/[?#]/)[0])
      .filter(Boolean))],
  );
  expect(slugs.length).toBeGreaterThan(10);

  for (const slug of slugs) {
    const response = await page.goto(`/astrologers/${slug}`);
    expect(response?.status(), `${slug} profile status`).toBe(200);

    // The pricing panel beside the hero is the one place a visitor looks for cost.
    const aside = page.locator(".expert-profile-hero aside");
    await expect(aside, `${slug} pricing panel`).toBeVisible();
    const asideText = await aside.innerText();

    expect(asideText, `${slug} shows no price at all`).toMatch(/₹\s?[\d,]+/);

    // Per-minute practitioners must say so; flat-price ones must not.
    if (REAL_PRACTITIONERS.includes(slug)) {
      expect(asideText, `${slug} is per-minute but shows no /min rate`).toMatch(/\/\s?min/);
    } else {
      expect(asideText, `${slug} is flat-price but shows a /min rate`).not.toMatch(/\/\s?min/);
    }

    await expect(page.getByRole("heading", { level: 1 }), `${slug} name`).toBeVisible();
  }
});

test("the marketplace price on a card matches that practitioner's profile", async ({ page }) => {
  await page.goto("/astrologers");

  // Read the charged price from the card's own price element rather than by scanning the whole
  // card text: both surfaces render a struck-through original alongside it, and the profile adds
  // "you save ₹N" copy afterwards, so any positional heuristic over raw text picks the wrong one.
  const card = await page.evaluate(() => {
    const anchor = document.querySelector("a[href*='/astrologers/']") as HTMLAnchorElement | null;
    const container = anchor?.closest("article, li") ?? anchor?.parentElement;
    const price = container?.querySelector("em");
    return { slug: anchor?.getAttribute("href")?.split("/astrologers/")[1], price: price?.textContent ?? "" };
  });
  const cardPrice = [...card.price.matchAll(/₹\s?([\d,]+)/g)].at(-1)?.[1].replace(/,/g, "");
  expect(cardPrice, "no price found on the marketplace card").toBeTruthy();

  await page.goto(`/astrologers/${card.slug}`);
  // The <strong> in the pricing row holds "<s>original</s>charged", so the last figure inside it
  // is the amount actually billed.
  const profilePrice = await page.locator(".expert-profile-hero aside strong").first().textContent();
  const profileCharged = [...(profilePrice ?? "").matchAll(/₹\s?([\d,]+)/g)].at(-1)?.[1].replace(/,/g, "");

  expect(profileCharged, `card/profile price mismatch for ${card.slug}`).toBe(cardPrice);
});
