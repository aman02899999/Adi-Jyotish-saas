import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createCategory, getAllCategoriesAdmin, GemstoneError, type CategoryPayload } from "@/lib/gemstones";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });
  return Response.json(await getAllCategoriesAdmin());
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const body = (await request.json()) as CategoryPayload;
  try {
    const created = await createCategory(body);
    await recordAudit(admin, "gemstone_category.created", "gemstone_category", created.id, { name: created.name });
    return Response.json({ ...created, productCount: 0 }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof GemstoneError ? error.message : "Category could not be created." }, { status: 400 });
  }
}
