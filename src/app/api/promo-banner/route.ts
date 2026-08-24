import { getPromoBanner } from "@/lib/promo-banner";

export const dynamic = "force-dynamic";

/** Public, unauthenticated read — the site-wide announcement bar is meant for every visitor. */
export async function GET() {
  const banner = await getPromoBanner();
  return Response.json(banner);
}
