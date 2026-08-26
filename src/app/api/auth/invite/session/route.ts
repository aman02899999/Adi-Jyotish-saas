import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/firestore";
import { createAdminSession, getCurrentAdmin } from "@/lib/admin-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";
import { checkTwoFactorGate } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/** Completes the admin invite-acceptance flow: after the client signs in (via the Firebase
 * client SDK, with the email/password just set in /api/auth/invite/accept) it POSTs the
 * resulting ID token here to mint the admin session cookie.
 *
 * This endpoint can't actually verify the caller just came from the accept step — any valid ID
 * token for an existing adminUsers doc reaches createAdminSession() below, making it a second,
 * unguarded login path if left without the same gates as /api/auth/login. Rate limiting, auth
 * throttling, and the 2FA gate are applied here for exactly that reason: closing this off as an
 * alternate route around 2FA for an already-established admin account, not because a brand-new
 * invitee is expected to hit the 2FA branch (they won't — they have no 2FA secret yet). */
export async function POST(request: Request) {
  const throttle = await checkRateLimit("admin-invite-session", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = (await request.json()) as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Sign-in could not be completed." }, { status: 400 });

  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(body.idToken, true)).uid;
  } catch {
    return Response.json({ error: "Sign-in could not be completed." }, { status: 401 });
  }

  const authThrottle = await checkAuthThrottle("admin-invite-session", uid, request);
  if (!authThrottle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(authThrottle.retryAfter) } });

  const challengeToken = await checkTwoFactorGate("admin", uid, body.idToken, db.collection("adminUsers").doc(uid));
  if (challengeToken) {
    await clearAuthFailures(authThrottle.keyHash);
    return Response.json({ error: "This account requires additional verification — please sign in from the admin login page instead." }, { status: 409 });
  }

  try {
    await createAdminSession(body.idToken);
  } catch {
    await recordAuthFailure(authThrottle.keyHash);
    return Response.json({ error: "Sign-in could not be completed." }, { status: 401 });
  }

  const admin = await getCurrentAdmin();
  if (!admin || admin.id !== uid) {
    await recordAuthFailure(authThrottle.keyHash);
    return Response.json({ error: "Sign-in could not be completed." }, { status: 401 });
  }
  await clearAuthFailures(authThrottle.keyHash);

  return Response.json({ ok: true, admin });
}
