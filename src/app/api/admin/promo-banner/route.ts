import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { getPromoBanner, updatePromoBanner } from "@/lib/promo-banner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "settings")) return Response.json({ error: "Settings permission required." }, { status: 403 });

  const body = await request.json() as { enabled?: boolean; message?: string; ctaLabel?: string; ctaHref?: string };
  const message = (body.message ?? "").trim().slice(0, 200);
  if (body.enabled && !message) return Response.json({ error: "Add a message before turning the banner on." }, { status: 400 });

  const ctaLabel = body.ctaLabel?.trim().slice(0, 40) || null;
  const ctaHref = body.ctaHref?.trim().slice(0, 300) || null;
  const banner = await updatePromoBanner({
    enabled: Boolean(body.enabled),
    message,
    ctaLabel: ctaLabel && ctaHref ? ctaLabel : null,
    ctaHref: ctaLabel && ctaHref ? ctaHref : null,
  });
  await recordAudit(admin, "promo_banner.updated", "promoBanner", "main", { enabled: banner.enabled });

  return Response.json({ ...banner, updatedAt: banner.updatedAt.toISOString() });
}
