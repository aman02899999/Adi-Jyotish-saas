import { getFooterContent } from "@/lib/site-content";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

/** SiteFooter used to call getFooterContent()/getStudioSettings() directly during server
 * rendering. Both are already unstable_cache-wrapped (cheap, 5-minute TTL), but a Server Component
 * calling Firestore at all still requires build-time credentials to ever be eligible for static
 * generation — and this footer renders on every single page. Moving the two DB-driven fields
 * (blurb, support email) to a client-side fetch, same pattern as /api/member/session, lets the
 * footer itself render statically so pages that don't otherwise need personalization can be
 * cached instead of rendered fresh on every request. */
export async function GET() {
  const [footer, settings] = await Promise.all([getFooterContent(), getStudioSettings()]);
  return Response.json({ blurb: footer.blurb, supportEmail: settings.supportEmail });
}
