import { getProductsBySlugs } from "@/lib/gemstones";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slugs = (searchParams.get("slugs") ?? "").split(",").map((slug) => slug.trim()).filter(Boolean).slice(0, 8);
  if (!slugs.length) return Response.json({ products: [] });
  try {
    return Response.json({ products: await getProductsBySlugs(slugs) });
  } catch (error) {
    // Public read used by the gemstone recommender/compare UI. When Firestore is
    // unavailable or misconfigured, return an empty catalog rather than a 500 that
    // breaks the surrounding page.
    console.warn("getProductsBySlugs: Firebase unavailable; returning empty catalog.", error);
    return Response.json({ products: [] });
  }
}
