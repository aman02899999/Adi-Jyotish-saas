import { expect, test } from "@playwright/test";

/**
 * Most visitors arrive on a phone. A page wider than the screen (the whole page scrolls sideways)
 * is the most common way a layout breaks there, and it is invisible on a desktop. 360px is a
 * common small Android width. Also fails on any image that does not load.
 */
const PAGES = ["/", "/astrologers", "/ask", "/horoscope", "/kundli", "/pricing", "/book", "/gemstones", "/palm-reading", "/tarot-reading", "/about", "/contact"];

test.describe("pages fit a 360px phone screen", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const path of PAGES) {
    test(path, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        brokenImages: Array.from(document.images).filter((image) => image.complete && image.src && image.naturalWidth === 0).map((image) => image.src),
      }));
      expect(layout.scrollWidth, `page is wider than the screen`).toBeLessThanOrEqual(layout.viewport + 1);
      expect(layout.brokenImages).toEqual([]);
    });
  }
});
