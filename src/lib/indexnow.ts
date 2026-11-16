// IndexNow: tells Bing (and the AI search engines that read Bing's index) which pages changed,
// instead of waiting for a crawl. Google does not take part. The key is public by design: the same
// value is served at /<key>.txt to prove the site is ours. No personal data is ever sent, only
// public page addresses.

export const INDEXNOW_KEY = "e6d6ae9242b4810536adfcb712d55008";

/** Pages whose content changes every day (computed from the day's sky). */
export const DAILY_PATHS = ["/horoscope", "/panchang"];

/** The pages that carry prices, offers and the main tools: resubmitted once a week. */
export const WEEKLY_PATHS = ["/", "/astrologers", "/pricing", "/book", "/kundli", "/kundli-matching", "/muhurat", "/blog"];

type Post = { slug: string; publishedAt: string };

/**
 * What to submit today: the daily pages, the main pages on Mondays, and any blog post published
 * in the last day. IndexNow asks sites not to resubmit pages that did not change.
 */
export function indexNowUrls(site: URL, posts: Post[], now: Date, monday: boolean): string[] {
  const dayAgo = now.getTime() - 26 * 3_600_000;
  const fresh = posts.filter((p) => (Date.parse(p.publishedAt) || 0) >= dayAgo && (Date.parse(p.publishedAt) || 0) <= now.getTime()).map((p) => `/blog/${p.slug}`);
  const paths = [...DAILY_PATHS, ...(monday ? WEEKLY_PATHS : []), ...fresh];
  return [...new Set(paths)].map((p) => new URL(p, site).toString());
}

/** How many addresses were accepted. Throws on a refusal so the run is recorded as failed and retried. */
export async function submitIndexNow(urls: string[], doFetch: typeof fetch = fetch): Promise<number> {
  if (!urls.length) return 0;
  const host = new URL(urls[0]).host;
  const res = await doFetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`, urlList: urls }),
    signal: AbortSignal.timeout(15_000),
  });
  // 200 and 202 both mean accepted.
  if (!res.ok) throw new Error(`IndexNow answered HTTP ${res.status}`);
  return urls.length;
}
