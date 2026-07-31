import { createMemberSession, getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Completes member self-registration: the client already created the Firebase Auth account
 * (createUserWithEmailAndPassword) and hands us the resulting ID token, plus the display name,
 * to create the Firestore profile document and mint a session cookie. */
export async function POST(request: Request) {
  const throttle = await checkRateLimit("member-register", requestIp(request), 8, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { idToken?: string; name?: string };
  const name = body.name?.trim().slice(0, 120) ?? "";
  if (name.length < 2) return Response.json({ error: "Enter your name." }, { status: 400 });
  if (!body.idToken) return Response.json({ error: "Your account could not be created." }, { status: 400 });

  try {
    await createMemberSession(body.idToken, name);
  } catch {
    return Response.json({ error: "Your account could not be created." }, { status: 401 });
  }

  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Your account could not be created." }, { status: 401 });
  return Response.json({ ok: true, member }, { status: 201 });
}
