import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/firestore";
import { createAdminSession, getCurrentAdmin, recordAudit } from "@/lib/admin-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";
import { checkTwoFactorGate } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/** Completes admin sign-in: the client already authenticated with Firebase Auth (email/password
 * or Google) and hands us the resulting ID token to verify and mint a session cookie — unless the
 * account has 2FA enabled, in which case this stops short and hands back a challenge token for
 * /api/auth/login/verify-2fa instead. */
export async function POST(request: Request) {
  const throttle = await checkRateLimit("admin-login", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(body.idToken, true)).uid;
  } catch {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const authThrottle = await checkAuthThrottle("admin-login", uid, request);
  if (!authThrottle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(authThrottle.retryAfter) } });

  const challengeToken = await checkTwoFactorGate("admin", uid, body.idToken, db.collection("adminUsers").doc(uid));
  if (challengeToken) {
    await clearAuthFailures(authThrottle.keyHash);
    return Response.json({ requiresTotp: true, challengeToken });
  }

  try {
    await createAdminSession(body.idToken);
  } catch {
    await recordAuthFailure(authThrottle.keyHash);
    return Response.json({ error: "This account does not have administrator access." }, { status: 403 });
  }

  const admin = await getCurrentAdmin();
  if (!admin || admin.id !== uid) {
    await recordAuthFailure(authThrottle.keyHash);
    return Response.json({ error: "This account does not have administrator access." }, { status: 403 });
  }
  await clearAuthFailures(authThrottle.keyHash);

  await recordAudit(admin, "auth.login", "administrator", admin.id);
  return Response.json({ ok: true, admin });
}
