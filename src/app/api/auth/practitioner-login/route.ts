import { createPractitionerSession, getCurrentPractitioner } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

/** Completes practitioner sign-in: the client already authenticated with Firebase Auth
 * (email/password or Google) and hands us the resulting ID token to verify and mint a session
 * cookie. The practitioner record (and its firebaseUid link) must already exist. */
export async function POST(request: Request) {
  const body = (await request.json()) as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });

  try {
    await createPractitionerSession(body.idToken);
  } catch {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "This account does not have practitioner portal access." }, { status: 403 });

  return Response.json({ ok: true });
}
