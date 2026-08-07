import { createPractitionerSession, getCurrentPractitioner } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

/** Completes the practitioner invite-acceptance flow, mirroring /api/auth/invite/session. */
export async function POST(request: Request) {
  const body = (await request.json()) as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Sign-in could not be completed." }, { status: 400 });

  try {
    await createPractitionerSession(body.idToken);
  } catch {
    return Response.json({ error: "Sign-in could not be completed." }, { status: 401 });
  }

  const practitioner = await getCurrentPractitioner();
  return Response.json({ ok: true, practitioner });
}
