import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { deleteProduct, GemstoneError, getProductAdminById, updateProduct, type ProductPayload } from "@/lib/gemstones";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid product id." }, { status: 400 });

  const detail = await getProductAdminById(id);
  if (!detail) return Response.json({ error: "Product not found." }, { status: 404 });
  return Response.json(detail);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid product id." }, { status: 400 });

  const body = (await request.json()) as ProductPayload;
  try {
    const updated = await updateProduct(id, body);
    await recordAudit(admin, "gemstone_product.updated", "gemstone_product", id, { name: updated?.name, active: updated?.active });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof GemstoneError ? error.message : "Product could not be updated." }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid product id." }, { status: 400 });

  try {
    await deleteProduct(id);
    await recordAudit(admin, "gemstone_product.deleted", "gemstone_product", id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof GemstoneError ? error.message : "Product could not be deleted." }, { status: 400 });
  }
}
