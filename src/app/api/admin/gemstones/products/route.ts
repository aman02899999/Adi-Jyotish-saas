import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createProduct, GemstoneError, type ProductPayload } from "@/lib/gemstones";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const body = (await request.json()) as ProductPayload;
  try {
    const created = await createProduct(body);
    await recordAudit(admin, "gemstone_product.created", "gemstone_product", created.id, { name: created.name, sku: created.sku });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof GemstoneError ? error.message : "Product could not be created." }, { status: 400 });
  }
}
