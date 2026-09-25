import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * Editable site content, the promo banner and the homepage trust strip on Postgres. Until this
 * port all of them read and wrote Firestore only (the guard could not see it: they use a
 * module-level collection handle or sit inside unstable_cache), so after cutover every homepage,
 * footer and banner edit would have gone to a database the site no longer reads, and the homepage
 * numbers would have frozen. Needs a migrated database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

const { getFooterContent, getHomeHeroContent, updateFooterContent, updateHomeHeroContent } = await import("@/lib/site-content");
const { getPromoBanner, updatePromoBanner } = await import("@/lib/promo-banner");
const { getFeaturedTestimonials, getHomepageStats, getOnlineNowCount } = await import("@/lib/homepage");

const P = "cms_itest_";

async function cleanup() {
  await query(`delete from public.site_content where id in ('home-hero', 'footer')`);
  await query(`delete from public.promo_banner where id = 'main'`);
  await query(`delete from public.practitioner_reviews where id like 'cms\\_itest\\_%'`);
  await query(`delete from public.bookings where id like 'cms\\_itest\\_%'`);
  await query(`delete from public.services where id like 'cms\\_itest\\_%'`);
  await query(`delete from public.practitioners where id like 'cms\\_itest\\_%'`);
}

async function addPractitioner(id: string, opts: { demo?: boolean; online?: boolean } = {}) {
  await query(
    `insert into public.practitioners (id, name, slug, email, active, online, is_demo_account) values ($1, 'P', $1, $2, true, $3, $4)`,
    [id, `${id}@example.test`, opts.online ?? false, opts.demo ?? false],
  );
}

async function addReview(id: string, practitionerId: string, opts: { rating: number; source?: string | null; body?: string; createdAt?: string }) {
  await query(
    `insert into public.practitioner_reviews (id, practitioner_id, reviewer_name, rating, clarity, empathy, usefulness, body, status, source, created_at)
     values ($1, $2, 'Asha', $3, $3, $3, $3, $4, 'published', $5, $6)`,
    [id, practitionerId, opts.rating, opts.body ?? "A genuinely helpful consultation, clear and kind throughout.", opts.source ?? null, opts.createdAt ?? new Date().toISOString()],
  );
}

describeCutover("site content, banner and homepage numbers on Postgres", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  describe("homepage hero and footer", () => {
    it("shows the built-in copy until an admin edits it", async () => {
      expect((await getHomeHeroContent()).headline).toBe("Your stars.");
      expect((await getFooterContent()).blurb).toContain("Ancient wisdom");
    });

    it("keeps an edit, changing only the fields given", async () => {
      const saved = await updateHomeHeroContent({ headline: "  New headline  " });
      expect(saved).toMatchObject({ headline: "New headline", eyebrow: "Ancient clarity, beautifully modern" });
      await updateHomeHeroContent({ lead: "New lead" });
      expect(await getHomeHeroContent()).toMatchObject({ headline: "New headline", lead: "New lead" });
      await updateFooterContent({ blurb: "New footer" });
      expect((await getFooterContent()).blurb).toBe("New footer");
    });

    it("refuses a javascript: link in a call to action", async () => {
      await updateHomeHeroContent({ primaryCtaHref: "javascript:alert(1)", secondaryCtaHref: "/pricing" });
      expect(await getHomeHeroContent()).toMatchObject({ primaryCtaHref: "/dashboard", secondaryCtaHref: "/pricing" });
    });

    it("reads a copied document, which carries its Firestore timestamp too", async () => {
      await query(`insert into public.site_content (id, data) values ('home-hero', $1)`, [JSON.stringify({ headline: "Copied", updatedAt: { _seconds: 1, _nanoseconds: 0 } })]);
      const hero = await getHomeHeroContent();
      expect(hero.headline).toBe("Copied");
      expect(hero).not.toHaveProperty("updatedAt");
    });
  });

  describe("promo banner", () => {
    it("is off until an admin turns it on", async () => {
      expect(await getPromoBanner()).toMatchObject({ enabled: false, message: "" });
    });

    it("keeps what the admin saved, and a later partial save keeps the rest", async () => {
      await updatePromoBanner({ enabled: true, message: "Diwali readings", ctaLabel: "Book", ctaHref: "/book", source: "manual", festivalKey: null });
      await updatePromoBanner({ message: "Diwali readings, now open" });
      const banner = await getPromoBanner();
      expect(banner).toMatchObject({ enabled: true, message: "Diwali readings, now open", ctaLabel: "Book", ctaHref: "/book", source: "manual" });
      expect(new Date(banner.updatedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    });
  });

  describe("homepage trust strip", () => {
    it("counts genuine reviews of real practitioners only", async () => {
      await addPractitioner(`${P}real`);
      await addPractitioner(`${P}demo`, { demo: true });
      const before = await getHomepageStats();

      await addReview(`${P}genuine`, `${P}real`, { rating: 4 });
      await addReview(`${P}synthetic`, `${P}real`, { rating: 5, source: "seed" });
      await addReview(`${P}of-demo`, `${P}demo`, { rating: 5 });

      const after = await getHomepageStats();
      expect(after.reviewCount - before.reviewCount).toBe(1);
      expect(after.practitionerCount - before.practitionerCount).toBe(0);
      expect(typeof after.averageRating).toBe("number");
    });

    it("counts completed consultations and online practitioners, never demo ones", async () => {
      const before = { stats: await getHomepageStats(), online: await getOnlineNowCount() };
      await addPractitioner(`${P}online`, { online: true });
      await addPractitioner(`${P}demo-online`, { online: true, demo: true });
      await query(`insert into public.services (id, slug, title, category, description, price, duration) values ('${P}svc', '${P}svc', 'R', 'T', 'd', 100, 30)`);
      await query(
        `insert into public.bookings (id, reference, service_id, service_title, service_price, service_duration, practitioner_id, practitioner_name,
           client_name, client_email, birth_date, birth_time, birth_place, scheduled_at, status, payment_status)
         values ('${P}done', '${P}done', '${P}svc', 'R', 100, 30, '${P}online', 'P', 'C', 'c@example.test', '1990-01-01', '10:00', 'Jaipur', now(), 'completed', 'paid')`,
      );

      expect((await getHomepageStats()).consultationsDelivered - before.stats.consultationsDelivered).toBe(1);
      expect((await getHomepageStats()).practitionerCount - before.stats.practitionerCount).toBe(1);
      expect((await getOnlineNowCount()) - before.online).toBe(1);
    });

    it("quotes the best genuine testimonials, never a synthetic or one-line one", async () => {
      await addPractitioner(`${P}real`);
      // Dated ahead so no other suite's review can outrank them.
      const ahead = (seconds: number) => new Date(Date.now() + 86_400_000 + seconds * 1000).toISOString();
      await addReview(`${P}best`, `${P}real`, { rating: 5, createdAt: ahead(1), body: "The clearest reading I have ever had, and so patient with my questions." });
      await addReview(`${P}fake`, `${P}real`, { rating: 5, source: "seed", createdAt: ahead(3) });
      await addReview(`${P}short`, `${P}real`, { rating: 5, createdAt: ahead(2), body: "Great!" });

      const quoted = await getFeaturedTestimonials(1);
      expect(quoted).toEqual([{ reviewerName: "Asha", body: "The clearest reading I have ever had, and so patient with my questions.", rating: 5 }]);
    });
  });
});
