import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { CustomPageError, deleteCustomPage, type PageBlock, updateCustomPage } from "@/lib/custom-pages";

export const dynamic = "force-dynamic";

type UpdatePayload = Partial<{ title: string; metaDescription: string; blocks: PageBlock[]; published: boolean }>;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "website")) return Response.json({ error: "Website permission required." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json()) as UpdatePayload;
  try {
    const updated = await updateCustomPage(id, body);
    await recordAudit(admin, "custom_page.updated", "custom_page", updated.id, { title: updated.title, published: updated.published });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof CustomPageError ? error.message : "Page could not be updated." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "website")) return Response.json({ error: "Website permission required." }, { status: 403 });

  const { id } = await params;
  try {
    await deleteCustomPage(id);
    await recordAudit(admin, "custom_page.deleted", "custom_page", id, {});
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof CustomPageError ? error.message : "Page could not be deleted." }, { status: 400 });
  }
}
