import { getCurrentAdmin, hasAdminPermission } from "@/lib/admin-auth";
import { getAllPayoutsAdmin } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "billing")) return Response.json({ error: "Billing permission required." }, { status: 403 });

  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  return Response.json(await getAllPayoutsAdmin(status));
}
