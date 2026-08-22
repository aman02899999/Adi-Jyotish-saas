import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

/** Lightweight "who's signed in" check for the site header — deliberately separate from the
 * heavier /api/member/profile (which returns full birth/contact details). SiteHeader used to call
 * getCurrentMember() directly during server rendering, which reads cookies() and therefore forces
 * every public page that includes it into full per-request dynamic rendering (no static/ISR
 * caching at all, plus two blocking network round-trips — Admin Auth session verify and a
 * Firestore read — before any HTML could be produced, on every single page view). Moving this to
 * a client-side fetch (same pattern PromoBanner already uses) keeps the header itself out of the
 * server render's dynamic-API path, so pages that don't otherwise need personalization can go
 * back to being statically generated / ISR'd. */
export async function GET() {
  const member = await getCurrentMember();
  return Response.json({ name: member ? member.name : null });
}
