import { getProductsBySlugs } from "@/lib/gemstones";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slugs = (searchParams.get("slugs") ?? "").split(",").map((slug) => slug.trim()).filter(Boolean).slice(0, 8);
  if (!slugs.length) return Response.json({ products: [] });
  return Response.json({ products: await getProductsBySlugs(slugs) });
}
