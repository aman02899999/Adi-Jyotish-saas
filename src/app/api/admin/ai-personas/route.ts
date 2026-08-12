import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { AiPersonaError, createPersona, getAllPersonasAdmin } from "@/lib/ai-personas";

export const dynamic = "force-dynamic";

type CreatePayload = {
  name?: string; title?: string; avatarUrl?: string | null; description?: string; systemPrompt?: string;
  sampleQuestions?: string[]; price?: number; currency?: string; active?: boolean;
};

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "ai_personas")) return Response.json({ error: "AI personas permission required." }, { status: 403 });
  return Response.json(await getAllPersonasAdmin());
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "ai_personas")) return Response.json({ error: "AI personas permission required." }, { status: 403 });

  const body = (await request.json()) as CreatePayload;
  try {
    const created = await createPersona({
      name: body.name ?? "",
      title: body.title ?? "",
      avatarUrl: body.avatarUrl ?? null,
      description: body.description ?? "",
      systemPrompt: body.systemPrompt ?? "",
      sampleQuestions: body.sampleQuestions ?? [],
      price: Number(body.price) || 0,
      currency: body.currency || "INR",
      active: body.active ?? false,
    });
    await recordAudit(admin, "ai_persona.created", "ai_persona", created.id, { name: created.name });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof AiPersonaError ? error.message : "Persona could not be created." }, { status: 400 });
  }
}
