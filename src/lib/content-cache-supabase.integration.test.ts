import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * Horoscope readings and transit houses on Postgres. Until this port both were cached in Firestore
 * only; and the copied horoscope table could not hold a Monday's daily reading and that week's
 * reading together (0014). Needs a migrated database; the route-level cases need
 * SUPABASE_CUTOVER=true.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
const notified = vi.hoisted(() => ({ titles: [] as string[] }));
vi.mock("@/lib/notifications", () => ({ createNotification: async ({ title }: { title: string }) => { notified.titles.push(title); } }));

const { readOrCreateHoroscopeInSupabase, swapTransitHousesInSupabase } = await import("@/lib/content-cache-supabase");

const SIGN = "hcache_itest";
const MEMBER = "hcache_itest_member";
const houses = (jupiter: number, saturn = 5) => ({ moon: 1, jupiter, saturn, rahu: 3, ketu: 9 });

async function cleanup() {
  await query(`delete from public.daily_horoscopes where sign = $1 or id like 'hcache\\_itest%' or id like 'aries\\_%'`, [SIGN]);
  await query(`delete from public.cosmic_weather where id like 'hcache\\_itest%'`);
}

describeDb("computed caches on Postgres", () => {
  beforeEach(async () => {
    await cleanup();
    notified.titles.length = 0;
  });
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  describe("horoscope readings", () => {
    it("keeps a Monday's daily reading and that week's reading side by side", async () => {
      await readOrCreateHoroscopeInSupabase(`${SIGN}_2026-09-21`, SIGN, "2026-09-21", "The day.");
      await readOrCreateHoroscopeInSupabase(`${SIGN}_week_2026-09-21`, SIGN, "2026-09-21", "The week.");
      const { rows } = await query(`select id, content from public.daily_horoscopes where sign = $1 order by id`, [SIGN]);
      expect(rows).toEqual([{ id: `${SIGN}_2026-09-21`, content: "The day." }, { id: `${SIGN}_week_2026-09-21`, content: "The week." }]);
    });

    it("returns the stored reading rather than a fresh one", async () => {
      await readOrCreateHoroscopeInSupabase(`${SIGN}_month_2026-09`, SIGN, "2026-09", "First.");
      expect((await readOrCreateHoroscopeInSupabase(`${SIGN}_month_2026-09`, SIGN, "2026-09", "Second.")).content).toBe("First.");
    });

    it("gives every concurrent first request the same text", async () => {
      const results = await Promise.all(["A", "B", "C", "D"].map((text) => readOrCreateHoroscopeInSupabase(`${SIGN}_2026-09-22`, SIGN, "2026-09-22", text)));
      expect(new Set(results.map((r) => r.content)).size).toBe(1);
    });
  });

  describe("transit houses", () => {
    it("reports nothing stored on a member's first visit, then what was stored", async () => {
      expect(await swapTransitHousesInSupabase(MEMBER, houses(4))).toEqual({});
      expect(await swapTransitHousesInSupabase(MEMBER, houses(5))).toEqual(houses(4));
      expect(await swapTransitHousesInSupabase(MEMBER, houses(5))).toEqual(houses(5));
    });

    it("does not rewrite the row when nothing moved", async () => {
      await swapTransitHousesInSupabase(MEMBER, houses(4));
      await query(`update public.cosmic_weather set updated_at = 'epoch' where id = $1`, [MEMBER]);
      await swapTransitHousesInSupabase(MEMBER, houses(4));
      const { rows } = await query<{ updated_at: Date }>(`select updated_at from public.cosmic_weather where id = $1`, [MEMBER]);
      expect(new Date(rows[0].updated_at).getTime()).toBe(0);
    });

    it("lets only one of several concurrent loads see the old houses", async () => {
      await swapTransitHousesInSupabase(MEMBER, houses(4));
      const seen = await Promise.all(Array.from({ length: 6 }, () => swapTransitHousesInSupabase(MEMBER, houses(5))));
      expect(seen.filter((previous) => previous.jupiter === 4)).toHaveLength(1);
    });
  });

  describeCutover("through the app, with the cutover on", () => {
    it("serves and caches every horoscope period from Postgres", async () => {
      const { getHoroscopeForPeriod } = await import("@/lib/horoscopes");
      for (const period of ["today", "tomorrow", "week", "month"] as const) {
        const first = await getHoroscopeForPeriod("aries", period);
        expect(first.content.length).toBeGreaterThan(20);
        expect((await getHoroscopeForPeriod("aries", period)).content).toBe(first.content);
      }
      const { rows } = await query<{ n: number }>(`select count(*)::int as n from public.daily_horoscopes where sign = 'aries'`);
      expect(rows[0].n).toBeGreaterThanOrEqual(3);
    });

    it("tells a member once when Jupiter changes house", async () => {
      const { getCosmicWeather } = await import("@/lib/transit-alerts");
      const member = { name: "Asha", birthDate: "1990-01-01", birthTime: "10:00", birthPlace: "Jaipur, India" };

      const first = await getCosmicWeather(member, MEMBER);
      expect(first?.activeTransits.every((t) => !t.isNew)).toBe(true);
      const jupiter = first!.activeTransits.find((t) => t.graha === "jupiter")!.house;

      await query(`update public.cosmic_weather set houses = jsonb_set(houses, '{jupiter}', to_jsonb($2::int)) where id = $1`, [MEMBER, (jupiter % 12) + 1]);
      const moved = await getCosmicWeather(member, MEMBER);
      expect(moved?.activeTransits.find((t) => t.graha === "jupiter")?.isNew).toBe(true);
      expect(notified.titles).toEqual(["Jupiter moved into a new house for you"]);

      await getCosmicWeather(member, MEMBER);
      expect(notified.titles).toHaveLength(1);
    });
  });
});
