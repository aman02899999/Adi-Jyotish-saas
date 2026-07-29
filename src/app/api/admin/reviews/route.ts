import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { getAdminReviews } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "reviews")) return Response.json({ error: "Reviews permission required." }, { status: 403 });
  return Response.json(await getAdminReviews());
}
