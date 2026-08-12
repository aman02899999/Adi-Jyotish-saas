import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/firestore";
import { createMemberSession, getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";
import { checkTwoFactorGate } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/** Completes member sign-in: the client already authenticated with Firebase Auth
 * (email/password or Google) and hands us the resulting ID token to verify and mint a session
 * cookie — unless the account has 2FA enabled, in which case this stops short of minting a
 * session and hands back a challenge token for /api/member/login/verify-2fa instead. */
export async function POST(request: Request) {
  const throttle = await checkRateLimit("member-login", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(body.idToken, true)).uid;
  } catch {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const authThrottle = await checkAuthThrottle("member-login", uid, request);
  if (!authThrottle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(authThrottle.retryAfter) } });

  const challengeToken = await checkTwoFactorGate("member", uid, body.idToken, db.collection("members").doc(uid));
  if (challengeToken) {
    await clearAuthFailures(authThrottle.keyHash);
    return Response.json({ requiresTotp: true, challengeToken });
  }

  try {
    await createMemberSession(body.idToken);
  } catch {
    await recordAuthFailure(authThrottle.keyHash);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const member = await getCurrentMember();
  if (!member) {
    await recordAuthFailure(authThrottle.keyHash);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  await clearAuthFailures(authThrottle.keyHash);
  return Response.json({ ok: true, onboardingComplete: member.onboardingComplete });
}
