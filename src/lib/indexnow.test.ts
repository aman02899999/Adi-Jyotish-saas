import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DAILY_PATHS, INDEXNOW_KEY, WEEKLY_PATHS, indexNowUrls, submitIndexNow } from "./indexnow";

const site = new URL("https://www.astronomers.in");
const now = new Date("2026-11-17T01:30:00Z");

describe("IndexNow", () => {
  it("serves the ownership key at /<key>.txt", () => {
    const file = path.resolve(__dirname, `../../public/${INDEXNOW_KEY}.txt`);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(INDEXNOW_KEY);
  });

  it("sends only the daily pages on a quiet day", () => {
    expect(indexNowUrls(site, [{ slug: "old", publishedAt: "2026-09-01" }], now, false)).toEqual(DAILY_PATHS.map((p) => `https://www.astronomers.in${p}`));
  });

  it("adds the main pages on Mondays and posts published in the last day, never future ones", () => {
    const urls = indexNowUrls(site, [{ slug: "new", publishedAt: "2026-11-16T09:00:00Z" }, { slug: "scheduled", publishedAt: "2026-12-01" }], now, true);
    expect(urls).toHaveLength(DAILY_PATHS.length + WEEKLY_PATHS.length + 1);
    expect(urls).toContain("https://www.astronomers.in/blog/new");
    expect(urls).toContain("https://www.astronomers.in/");
    expect(urls.some((u) => u.endsWith("/scheduled"))).toBe(false);
  });

  it("sends page addresses and the public key, nothing else", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 202 }));
    expect(await submitIndexNow(["https://www.astronomers.in/panchang"], fetcher as unknown as typeof fetch)).toBe(1);
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toEqual({ host: "www.astronomers.in", key: INDEXNOW_KEY, keyLocation: `https://www.astronomers.in/${INDEXNOW_KEY}.txt`, urlList: ["https://www.astronomers.in/panchang"] });
  });

  it("sends nothing for an empty list and fails loudly on a refusal", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 403 }));
    expect(await submitIndexNow([], fetcher as unknown as typeof fetch)).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(submitIndexNow(["https://www.astronomers.in/"], fetcher as unknown as typeof fetch)).rejects.toThrow("HTTP 403");
  });
});
