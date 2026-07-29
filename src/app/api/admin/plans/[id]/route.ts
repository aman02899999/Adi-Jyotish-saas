import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { updatePlan, type PlanPayload } from "@/lib/plans";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "plans")) return Response.json({ error: "Plans permission required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid plan id." }, { status: 400 });

  const body = (await request.json()) as PlanPayload;
  try {
    const updated = await updatePlan(id, body);
    await recordAudit(admin, "plan.updated", "membership_plan", updated.id, { name: updated.name, active: updated.active });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Plan could not be updated." }, { status: 400 });
  }
}
