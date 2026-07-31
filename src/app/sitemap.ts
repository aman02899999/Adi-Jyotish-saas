import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { getAllActiveProductSlugs, getActiveCategories } from "@/lib/gemstones";
import { getMarketplacePractitioners } from "@/lib/marketplace";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const updated = new Date();
  const people = await getMarketplacePractitioners();
  const posts = getAllPosts();
  const [gemstoneProducts, gemstoneCategories] = await Promise.all([getAllActiveProductSlugs(), getActiveCategories()]);
  return [
    { url: new URL("/", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/astrologers", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.95 },
    { url: new URL("/gemstones", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.95 },
    { url: new URL("/gemstones/shop", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.9 },
    { url: new URL("/book", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.9 },
    { url: new URL("/ask", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.85 },
    { url: new URL("/kundli", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.85 },
    { url: new URL("/horoscope", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.8 },
    { url: new URL("/gemstones/recommend", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.75 },
    { url: new URL("/kundli-matching", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.75 },
    { url: new URL("/panchang", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.75 },
    { url: new URL("/numerology", site).toString(), lastModified: updated, changeFrequency: "monthly", priority: 0.7 },
    { url: new URL("/blog", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.7 },
    ...people.map((person) => ({ url: new URL(`/astrologers/${person.slug}`, site).toString(), lastModified: person.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...posts.map((post) => ({ url: new URL(`/blog/${post.slug}`, site).toString(), lastModified: new Date(post.publishedAt), changeFrequency: "monthly" as const, priority: 0.6 })),
    ...gemstoneCategories.map((category) => ({ url: new URL(`/gemstones/shop?category=${category.slug}`, site).toString(), lastModified: updated, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...gemstoneProducts.map((product) => ({ url: new URL(`/gemstones/${product.slug}`, site).toString(), lastModified: product.updatedAt, changeFrequency: "weekly" as const, priority: 0.75 })),
  ];
}
