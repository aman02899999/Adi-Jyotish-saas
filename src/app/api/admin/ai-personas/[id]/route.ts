import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { AiPersonaError, deletePersona, updatePersona } from "@/lib/ai-personas";

export const dynamic = "force-dynamic";

type UpdatePayload = Partial<{
  name: string; title: string; avatarUrl: string | null; description: string; systemPrompt: string;
  sampleQuestions: string[]; price: number; currency: string; active: boolean;
}>;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "ai_personas")) return Response.json({ error: "AI personas permission required." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json()) as UpdatePayload;
  try {
    const updated = await updatePersona(id, body);
    await recordAudit(admin, "ai_persona.updated", "ai_persona", updated.id, { name: updated.name, active: updated.active });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof AiPersonaError ? error.message : "Persona could not be updated." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "ai_personas")) return Response.json({ error: "AI personas permission required." }, { status: 403 });

  const { id } = await params;
  try {
    await deletePersona(id);
    await recordAudit(admin, "ai_persona.deleted", "ai_persona", id, {});
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof AiPersonaError ? error.message : "Persona could not be deleted." }, { status: 400 });
  }
}
