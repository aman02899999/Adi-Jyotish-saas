import { getAuth } from "firebase-admin/auth";
import { createPractitionerSession, findPractitionerByUid, getCurrentPractitioner } from "@/lib/practitioner-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";
import { checkTwoFactorGate } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/** Completes the practitioner invite-acceptance flow, mirroring /api/auth/invite/session — see
 * that file's comment for why the rate limit, auth throttle, and 2FA gate are here even though a
 * brand-new invitee has no 2FA secret yet: this endpoint accepts any valid ID token for an
 * existing practitioner record, so without these gates it's an unguarded second login path that
 * bypasses whatever /api/auth/practitioner-login enforces. */
export async function POST(request: Request) {
  const throttle = await checkRateLimit("practitioner-invite-session", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Sign-in could not be completed." }, { status: 400 });

  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(body.idToken, true)).uid;
  } catch {
    return Response.json({ error: "Sign-in could not be completed." }, { status: 401 });
  }

  const authThrottle = await checkAuthThrottle("practitioner-invite-session", uid, request);
  if (!authThrottle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(authThrottle.retryAfter) } });

  const existing = await findPractitionerByUid(uid);
  if (existing) {
    const challengeToken = await checkTwoFactorGate("practitioner", uid, body.idToken, existing.ref);
    if (challengeToken) {
      await clearAuthFailures(authThrottle.keyHash);
      return Response.json({ error: "This account requires additional verification — please sign in from the practitioner login page instead." }, { status: 409 });
    }
  }

  try {
    await createPractitionerSession(body.idToken);
  } catch {
    await recordAuthFailure(authThrottle.keyHash);
    return Response.json({ error: "Sign-in could not be completed." }, { status: 401 });
  }

  const practitioner = await getCurrentPractitioner();
  if (!practitioner) {
    await recordAuthFailure(authThrottle.keyHash);
    return Response.json({ error: "Sign-in could not be completed." }, { status: 401 });
  }
  await clearAuthFailures(authThrottle.keyHash);

  return Response.json({ ok: true, practitioner });
}
