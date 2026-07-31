import { createAdminSession, getCurrentAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Completes the admin invite-acceptance flow: after the client signs in (via the Firebase
 * client SDK, with the email/password just set in /api/auth/invite/accept) it POSTs the
 * resulting ID token here to mint the admin session cookie. */
export async function POST(request: Request) {
  const body = (await request.json()) as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Sign-in could not be completed." }, { status: 400 });

  try {
    await createAdminSession(body.idToken);
  } catch {
    return Response.json({ error: "Sign-in could not be completed." }, { status: 401 });
  }

  const admin = await getCurrentAdmin();
  return Response.json({ ok: true, admin });
}
