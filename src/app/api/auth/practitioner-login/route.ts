import { getAuth } from "firebase-admin/auth";
import { createPractitionerSession, findPractitionerByUid, getCurrentPractitioner } from "@/lib/practitioner-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";
import { checkTwoFactorGate } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/** Completes practitioner sign-in: the client already authenticated with Firebase Auth
 * (email/password or Google) and hands us the resulting ID token to verify and mint a session
 * cookie. The practitioner record (and its firebaseUid link) must already exist — unless the
 * account has 2FA enabled, in which case this stops short and hands back a challenge token for
 * /api/auth/practitioner-login/verify-2fa instead. */
export async function POST(request: Request) {
  const throttle = await checkRateLimit("practitioner-login", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(body.idToken, true)).uid;
  } catch {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const authThrottle = await checkAuthThrottle("practitioner-login", uid, request);
  if (!authThrottle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(authThrottle.retryAfter) } });

  const existing = await findPractitionerByUid(uid);
  if (existing) {
    const challengeToken = await checkTwoFactorGate("practitioner", uid, body.idToken, existing.ref);
    if (challengeToken) {
      await clearAuthFailures(authThrottle.keyHash);
      return Response.json({ requiresTotp: true, challengeToken });
    }
  }

  try {
    await createPractitionerSession(body.idToken);
  } catch {
    await recordAuthFailure(authThrottle.keyHash);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const practitioner = await getCurrentPractitioner();
  if (!practitioner) {
    await recordAuthFailure(authThrottle.keyHash);
    return Response.json({ error: "This account does not have practitioner portal access." }, { status: 403 });
  }
  await clearAuthFailures(authThrottle.keyHash);

  return Response.json({ ok: true });
}
