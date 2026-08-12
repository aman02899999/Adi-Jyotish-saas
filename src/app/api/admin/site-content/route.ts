import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { getFooterContent, getHomeHeroContent, updateFooterContent, updateHomeHeroContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "website")) return Response.json({ error: "Website permission required." }, { status: 403 });
  const [hero, footer] = await Promise.all([getHomeHeroContent(), getFooterContent()]);
  return Response.json({ hero, footer });
}

type UpdatePayload = {
  hero?: Record<string, string>;
  footer?: Record<string, string>;
};

export async function PUT(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "website")) return Response.json({ error: "Website permission required." }, { status: 403 });

  const body = (await request.json()) as UpdatePayload;
  const [hero, footer] = await Promise.all([
    body.hero ? updateHomeHeroContent(body.hero) : getHomeHeroContent(),
    body.footer ? updateFooterContent(body.footer) : getFooterContent(),
  ]);
  await recordAudit(admin, "site_content.updated", "site_content", "home", {});
  return Response.json({ hero, footer });
}
