import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createPractitionerAdmin, getPractitionerDirectory, PractitionerAdminError } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

type CreatePayload = {
  name?: string; email?: string; title?: string; bio?: string; specialties?: string; languages?: string;
  consultationModes?: string; experienceYears?: number; chatRatePerMinute?: number; photoUrl?: string | null; videoUrl?: string | null;
  featured?: boolean; active?: boolean;
};

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "practitioners")) return Response.json({ error: "Practitioners permission required." }, { status: 403 });
  const rows = await getPractitionerDirectory(false, true);
  return Response.json(rows.map(({ rules, timeOff, ...person }) => person));
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "practitioners")) return Response.json({ error: "Practitioners permission required." }, { status: 403 });

  const body = (await request.json()) as CreatePayload;
  try {
    const created = await createPractitionerAdmin({
      name: body.name ?? "",
      email: body.email ?? "",
      title: body.title ?? "",
      bio: body.bio ?? "",
      specialties: body.specialties ?? "",
      languages: body.languages ?? "",
      consultationModes: body.consultationModes ?? "",
      experienceYears: Number(body.experienceYears) || 0,
      chatRatePerMinute: Number(body.chatRatePerMinute) || 0,
      photoUrl: body.photoUrl ?? null,
      videoUrl: body.videoUrl ?? null,
      featured: body.featured ?? false,
      active: body.active ?? false,
    });
    await recordAudit(admin, "practitioner.created", "practitioner", created.id, { name: created.name, email: created.email });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof PractitionerAdminError ? error.message : "Practitioner could not be created." }, { status: 400 });
  }
}
