import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { updatePractitionerProfile } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const body = (await request.json()) as { bio?: string; specialties?: string; languages?: string; consultationModes?: string; photoUrl?: string | null; videoUrl?: string | null };
  const updated = await updatePractitionerProfile(practitioner.id, body);
  return Response.json(updated);
}
