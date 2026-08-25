import type { MetadataRoute } from "next";
import { getActivePersonas } from "@/lib/ai-personas";
import { getAllPosts } from "@/lib/blog";
import { getMarketplacePractitioners } from "@/lib/marketplace";
import { getPublishedCustomPages } from "@/lib/custom-pages";
import { FESTIVALS } from "@/lib/festivals";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const updated = new Date();
  const people = await getMarketplacePractitioners();
  const posts = getAllPosts();
  const [personas, customPages] = await Promise.all([getActivePersonas(), getPublishedCustomPages()]);
  return [
    { url: new URL("/", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/astrologers", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.95 },
    // The storefront itself (shop/product/cart/checkout/compare) is offline for now — see the
    // comment atop /gemstones/page.tsx — so only the coming-soon index and the still-live free
    // recommender tool are worth a crawler's time; the old per-product/category URLs would just
    // redirect back to this same index page.
    { url: new URL("/gemstones", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.6 },
    { url: new URL("/book", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.9 },
    { url: new URL("/ask", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.85 },
    { url: new URL("/palm-reading", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.85 },
    { url: new URL("/tarot-reading", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.85 },
    { url: new URL("/face-reading", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.85 },
    { url: new URL("/vastu-consultation", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.85 },
    { url: new URL("/lal-kitab-reading", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.85 },
    { url: new URL("/kundli", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.85 },
    { url: new URL("/horoscope", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.8 },
    { url: new URL("/gemstones/recommend", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.75 },
    { url: new URL("/kundli-matching", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.75 },
    { url: new URL("/panchang", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.75 },
    { url: new URL("/muhurat", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.75 },
    { url: new URL("/festivals", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.7 },
    { url: new URL("/gift", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.6 },
    { url: new URL("/varshphal", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.7 },
    { url: new URL("/numerology", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.7 },
    { url: new URL("/blog", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.7 },
    { url: new URL("/pricing", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.6 },
    { url: new URL("/about", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.5 },
    { url: new URL("/contact", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.4 },
    { url: new URL("/privacy", site).toString(), lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: new URL("/terms", site).toString(), lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    { url: new URL("/refund-policy", site).toString(), lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    ...people.map((person) => ({ url: new URL(`/astrologers/${person.slug}`, site).toString(), lastModified: person.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...posts.map((post) => ({ url: new URL(`/blog/${post.slug}`, site).toString(), lastModified: new Date(post.publishedAt), changeFrequency: "monthly" as const, priority: 0.6 })),
    ...personas.map((persona) => ({ url: new URL(`/ai/${persona.slug}`, site).toString(), lastModified: persona.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...customPages.map((page) => ({ url: new URL(`/p/${page.slug}`, site).toString(), lastModified: page.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...FESTIVALS.map((festival) => ({ url: new URL(`/festivals/${festival.slug}`, site).toString(), lastModified: updated, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
