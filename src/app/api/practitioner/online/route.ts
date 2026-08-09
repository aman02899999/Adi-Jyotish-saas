import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { setPractitionerOnline } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const body = (await request.json()) as { online?: boolean };
  const updated = await setPractitionerOnline(practitioner.id, Boolean(body.online));
  return Response.json(updated);
}
