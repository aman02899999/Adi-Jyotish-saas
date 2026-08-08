import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/firestore";
import { createMemberSession, getCurrentMember } from "@/lib/member-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { checkTwoFactorGate } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/** Member Google sign-in: the client already authenticated via the Firebase Google provider and
 * hands us the resulting ID token. Members are keyed by Firebase UID, so there's no separate
 * account-linking step — createMemberSession creates the Firestore profile on first sign-in. An
 * existing account with 2FA enabled stops here and hands back a challenge token instead. */
export async function POST(request: Request) {
  const throttle = await checkRateLimit("member-google-login", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { idToken?: string; ref?: string };
  if (!body.idToken) return Response.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });

  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(body.idToken, true)).uid;
  } catch {
    return Response.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });
  }

  const challengeToken = await checkTwoFactorGate("member", uid, body.idToken, db.collection("members").doc(uid));
  if (challengeToken) return Response.json({ requiresTotp: true, challengeToken });

  try {
    await createMemberSession(body.idToken, undefined, body.ref?.trim().slice(0, 20));
  } catch {
    return Response.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });
  }

  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });
  return Response.json({ ok: true, onboardingComplete: member.onboardingComplete });
}
