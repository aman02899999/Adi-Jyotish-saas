import { createMemberSession, getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Completes member sign-in: the client already authenticated with Firebase Auth
 * (email/password or Google) and hands us the resulting ID token to verify and mint a session
 * cookie. */
export async function POST(request: Request) {
  const throttle = await checkRateLimit("member-login", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });

  try {
    await createMemberSession(body.idToken);
  } catch {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  return Response.json({ ok: true, onboardingComplete: member.onboardingComplete });
}
