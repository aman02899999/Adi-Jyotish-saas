import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { duplicateProduct, GemstoneError } from "@/lib/gemstones";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id } = await params;
  if (!id) return Response.json({ error: "Invalid product id." }, { status: 400 });

  try {
    const created = await duplicateProduct(id);
    await recordAudit(admin, "gemstone_product.duplicated", "gemstone_product", created.id, { fromId: id });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof GemstoneError ? error.message : "Product could not be duplicated." }, { status: 400 });
  }
}
