import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { getMarketplacePractitioners } from "@/lib/marketplace";
import { getSiteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const updated = new Date();
  const people = await getMarketplacePractitioners();
  const posts = getAllPosts();
  return [
    { url: new URL("/", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/astrologers", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.95 },
    { url: new URL("/book", site).toString(), lastModified: updated, changeFrequency: "daily", priority: 0.9 },
    { url: new URL("/blog", site).toString(), lastModified: updated, changeFrequency: "weekly", priority: 0.7 },
    ...people.map((person) => ({ url: new URL(`/astrologers/${person.slug}`, site).toString(), lastModified: person.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...posts.map((post) => ({ url: new URL(`/blog/${post.slug}`, site).toString(), lastModified: new Date(post.publishedAt), changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
