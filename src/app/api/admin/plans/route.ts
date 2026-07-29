import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createPlan, getAllPlans, type PlanPayload } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "plans")) return Response.json({ error: "Plans permission required." }, { status: 403 });
  return Response.json(await getAllPlans());
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "plans")) return Response.json({ error: "Plans permission required." }, { status: 403 });

  const body = (await request.json()) as PlanPayload;
  try {
    const created = await createPlan(body);
    await recordAudit(admin, "plan.created", "membership_plan", created.id, { key: created.key, name: created.name });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Plan could not be created." }, { status: 400 });
  }
}
