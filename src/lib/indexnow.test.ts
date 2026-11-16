import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import {
  INDEXNOW_KEY,
  MAX_URLS_PER_REQUEST,
  PRIVATE_PATH_PREFIXES,
  buildPayloads,
  extractSitemapUrls,
  normalizeUrls,
} from "../../scripts/indexnow-submit.mjs";

const SITE = "https://www.astronomers.in";

describe("IndexNow key", () => {
  it("is a valid key and is served from the site root with exactly that content", () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{8,128}$/);
    const keyFile = path.resolve(__dirname, `../../public/${INDEXNOW_KEY}.txt`);
    expect(existsSync(keyFile)).toBe(true);
    expect(readFileSync(keyFile, "utf8")).toBe(INDEXNOW_KEY);
  });
});

describe("normalizeUrls", () => {
  it("resolves paths against the site and keeps full URLs on the same host", () => {
    expect(normalizeUrls(["/panchang", `${SITE}/blog/a`], SITE)).toEqual([`${SITE}/panchang`, `${SITE}/blog/a`]);
  });

  it("drops other hosts, plain http and unparseable input", () => {
    expect(normalizeUrls(["https://example.com/x", "http://www.astronomers.in/x", "https://astronomers.in/x", "http://["], SITE)).toEqual([]);
  });

  it("never submits a path robots.txt disallows, in either language", () => {
    const inputs = ["/admin", "/admin/members", "/dashboard/wallet", "/hi/dashboard", "/api/health", "/account", "/gemstones/checkout", "/hi/practitioner/x"];
    expect(normalizeUrls(inputs, SITE)).toEqual([]);
    expect(normalizeUrls(["/administration-of-rituals", "/gemstones"], SITE)).toHaveLength(2);
  });

  it("covers every disallow rule in robots.ts", () => {
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules : [rules]).flatMap((rule) => rule.disallow ?? []);
    expect(disallow.length).toBeGreaterThan(0);
    for (const entry of disallow) expect(PRIVATE_PATH_PREFIXES).toContain(entry.replace(/\/$/, ""));
  });

  it("strips query strings and fragments and removes duplicates", () => {
    expect(normalizeUrls(["/kundli?dob=1990-01-01&place=Delhi", "/kundli#form", "/kundli"], SITE)).toEqual([`${SITE}/kundli`]);
  });
});

describe("extractSitemapUrls", () => {
  it("reads every loc and decodes ampersands", () => {
    const xml = `<urlset><url><loc>${SITE}/</loc></url><url><loc> ${SITE}/a?x=1&amp;y=2 </loc></url></urlset>`;
    expect(extractSitemapUrls(xml)).toEqual([`${SITE}/`, `${SITE}/a?x=1&y=2`]);
  });
});

describe("buildPayloads", () => {
  it("builds the body the protocol expects", () => {
    expect(buildPayloads([`${SITE}/panchang`], SITE)).toEqual([
      { host: "www.astronomers.in", key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: [`${SITE}/panchang`] },
    ]);
  });

  it("splits past the per-request limit and sends nothing for an empty list", () => {
    const urls = Array.from({ length: MAX_URLS_PER_REQUEST + 1 }, (_, i) => `${SITE}/p/${i}`);
    expect(buildPayloads(urls, SITE).map((payload) => payload.urlList.length)).toEqual([MAX_URLS_PER_REQUEST, 1]);
    expect(buildPayloads([], SITE)).toEqual([]);
  });
});
