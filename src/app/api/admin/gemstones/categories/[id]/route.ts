import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { deleteCategory, GemstoneError, updateCategory, type CategoryPayload } from "@/lib/gemstones";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id } = await params;
  if (!id) return Response.json({ error: "Invalid category id." }, { status: 400 });

  const body = (await request.json()) as CategoryPayload;
  try {
    const updated = await updateCategory(id, body);
    await recordAudit(admin, "gemstone_category.updated", "gemstone_category", updated.id, { name: updated.name, active: updated.active });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof GemstoneError ? error.message : "Category could not be updated." }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id } = await params;
  if (!id) return Response.json({ error: "Invalid category id." }, { status: 400 });

  try {
    await deleteCategory(id);
    await recordAudit(admin, "gemstone_category.deleted", "gemstone_category", id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof GemstoneError ? error.message : "Category could not be deleted." }, { status: 400 });
  }
}
