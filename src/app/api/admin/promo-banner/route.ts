import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { getPromoBanner, updatePromoBanner } from "@/lib/promo-banner";

export const dynamic = "force-dynamic";

/** Only a same-site relative path or an https:// URL is allowed — rendered unescaped as an <a href>
 * for every site visitor (src/components/promo-banner.tsx), so a javascript:/data: URI here would
 * be a stored-XSS vector triggered just by clicking the banner CTA. */
function isSafeCtaHref(href: string) {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    return new URL(href).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "settings")) return Response.json({ error: "Settings permission required." }, { status: 403 });

  const body = await request.json() as { enabled?: boolean; message?: string; ctaLabel?: string; ctaHref?: string };
  const message = (body.message ?? "").trim().slice(0, 200);
  if (body.enabled && !message) return Response.json({ error: "Add a message before turning the banner on." }, { status: 400 });

  const ctaLabel = body.ctaLabel?.trim().slice(0, 40) || null;
  const ctaHrefInput = body.ctaHref?.trim().slice(0, 300) || null;
  if (ctaHrefInput && !isSafeCtaHref(ctaHrefInput)) {
    return Response.json({ error: "Button link must be a site-relative path (e.g. /pricing) or an https:// URL." }, { status: 400 });
  }
  const ctaHref = ctaHrefInput;
  const banner = await updatePromoBanner({
    enabled: Boolean(body.enabled),
    message,
    ctaLabel: ctaLabel && ctaHref ? ctaLabel : null,
    ctaHref: ctaLabel && ctaHref ? ctaHref : null,
    source: "manual",
    festivalKey: null,
  });
  await recordAudit(admin, "promo_banner.updated", "promoBanner", "main", { enabled: banner.enabled });

  return Response.json(banner);
}
