import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createCustomPage, CustomPageError, getAllCustomPagesAdmin } from "@/lib/custom-pages";

export const dynamic = "force-dynamic";

type CreatePayload = { title?: string; metaDescription?: string };

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "website")) return Response.json({ error: "Website permission required." }, { status: 403 });
  return Response.json(await getAllCustomPagesAdmin());
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "website")) return Response.json({ error: "Website permission required." }, { status: 403 });

  const body = (await request.json()) as CreatePayload;
  try {
    const created = await createCustomPage({ title: body.title ?? "", metaDescription: body.metaDescription ?? "" });
    await recordAudit(admin, "custom_page.created", "custom_page", created.id, { title: created.title, slug: created.slug });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof CustomPageError ? error.message : "Page could not be created." }, { status: 400 });
  }
}
