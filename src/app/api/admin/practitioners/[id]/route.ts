import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { deletePractitionerAdmin, PractitionerAdminError, updatePractitionerAdmin } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

type UpdatePayload = Partial<{
  name: string; title: string; bio: string; specialties: string; languages: string; consultationModes: string;
  experienceYears: number; chatRatePerMinute: number; photoUrl: string | null; verified: boolean; featured: boolean; active: boolean;
}>;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "practitioners")) return Response.json({ error: "Practitioners permission required." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json()) as UpdatePayload;
  try {
    const updated = await updatePractitionerAdmin(id, body);
    await recordAudit(admin, "practitioner.updated", "practitioner", updated.id, { name: updated.name, active: updated.active });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof PractitionerAdminError ? error.message : "Practitioner could not be updated." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "practitioners")) return Response.json({ error: "Practitioners permission required." }, { status: 403 });

  const { id } = await params;
  try {
    await deletePractitionerAdmin(id);
    await recordAudit(admin, "practitioner.deleted", "practitioner", id, {});
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof PractitionerAdminError ? error.message : "Practitioner could not be deleted." }, { status: 400 });
  }
}
