#!/usr/bin/env node
/**
 * Tells IndexNow search engines (Bing, Yandex, Naver, Seznam, Yep — not Google) that pages on the
 * site are new or changed, so they are re-crawled sooner than the sitemap alone would manage.
 *
 *   node scripts/indexnow-submit.mjs                      submit every public URL in the live sitemap
 *   node scripts/indexnow-submit.mjs /blog/a /panchang    submit only these paths (or full URLs)
 *   node scripts/indexnow-submit.mjs --dry-run            print what would be sent, send nothing
 *
 * The site is read from SITE_URL, defaulting to production. The key is not a secret: the protocol
 * proves ownership by having the same string served from the site at /<key>.txt (public/<key>.txt
 * here), so it lives in the repo and needs no environment variable. A test fails if the two drift.
 *
 * Only public content is ever sent: anything outside the site's own host, or under a path robots.txt
 * disallows, is dropped before the request is built.
 */

export const INDEXNOW_KEY = "f5889568dd89c421a80851481d6e6f56";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const DEFAULT_SITE_URL = "https://www.astronomers.in";
/** The protocol accepts at most 10,000 URLs in one request. */
export const MAX_URLS_PER_REQUEST = 10000;

/** Mirrors the disallow list in src/app/robots.ts — pages search engines are told not to crawl. */
export const PRIVATE_PATH_PREFIXES = ["/admin", "/dashboard", "/practitioner", "/account", "/onboarding", "/api", "/gemstones/cart", "/gemstones/checkout", "/gemstones/order"];

const LOCALE_PREFIX = /^\/hi(?=\/|$)/;

function isPrivatePath(pathname) {
  const path = pathname.replace(LOCALE_PREFIX, "") || "/";
  return PRIVATE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Pulls every <loc> out of a sitemap document. */
export function extractSitemapUrls(xml) {
  const urls = [];
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    urls.push(match[1].replaceAll("&amp;", "&"));
  }
  return urls;
}

/**
 * Turns paths or full URLs into the list that may be submitted: absolute, https, on the site's own
 * host, public, without query string or fragment, and de-duplicated in first-seen order.
 */
export function normalizeUrls(inputs, siteUrl) {
  const site = new URL(siteUrl);
  const seen = new Set();
  for (const input of inputs) {
    let url;
    try {
      url = new URL(input, site);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.host !== site.host) continue;
    if (isPrivatePath(url.pathname)) continue;
    url.search = "";
    url.hash = "";
    seen.add(url.toString());
  }
  return [...seen];
}

/** The JSON bodies to POST, split so no request exceeds the protocol's URL limit. */
export function buildPayloads(urls, siteUrl, key = INDEXNOW_KEY) {
  const site = new URL(siteUrl);
  const payloads = [];
  for (let start = 0; start < urls.length; start += MAX_URLS_PER_REQUEST) {
    payloads.push({
      host: site.host,
      key,
      keyLocation: new URL(`/${key}.txt`, site).toString(),
      urlList: urls.slice(start, start + MAX_URLS_PER_REQUEST),
    });
  }
  return payloads;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const requested = args.filter((arg) => !arg.startsWith("--"));
  const siteUrl = process.env.SITE_URL || DEFAULT_SITE_URL;

  let inputs = requested;
  if (inputs.length === 0) {
    const sitemapUrl = new URL("/sitemap.xml", siteUrl);
    const response = await fetch(sitemapUrl);
    if (!response.ok) throw new Error(`Could not read ${sitemapUrl}: HTTP ${response.status}`);
    inputs = extractSitemapUrls(await response.text());
  }

  const urls = normalizeUrls(inputs, siteUrl);
  if (urls.length === 0) {
    console.log("Nothing to submit: no public URLs on this site were given or found.");
    return;
  }
  console.log(`${dryRun ? "Would submit" : "Submitting"} ${urls.length} URL(s) for ${new URL(siteUrl).host}`);
  for (const url of urls) console.log(`  ${url}`);
  if (dryRun) return;

  for (const payload of buildPayloads(urls, siteUrl)) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    // 200 = accepted, 202 = accepted and the key file is still being checked.
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`IndexNow refused the submission: HTTP ${response.status} ${await response.text()}`);
    }
    console.log(`IndexNow accepted ${payload.urlList.length} URL(s): HTTP ${response.status}`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
