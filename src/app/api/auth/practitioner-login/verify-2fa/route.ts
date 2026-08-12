import { db } from "@/lib/firestore";
import { createPractitionerSession, getCurrentPractitioner } from "@/lib/practitioner-auth";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";
import { deleteTwoFactorChallenge, peekTwoFactorChallenge, verifyTotpOrBackupCode } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { challengeToken?: string; code?: string };
  const challengeToken = body.challengeToken ?? "";
  const code = (body.code ?? "").trim();
  if (!challengeToken || !code) return Response.json({ error: "Enter your 6-digit code." }, { status: 400 });

  const pending = peekTwoFactorChallenge("practitioner", challengeToken);
  if (!pending) return Response.json({ error: "This code has expired. Sign in again." }, { status: 401 });

  const byUid = await db.collection("practitioners").where("firebaseUid", "==", pending.uid).limit(1).get();
  const doc = byUid.docs[0];
  const secret = doc?.data().totpSecret as string | undefined;
  if (!doc || !secret || doc.data().totpEnabled !== true) {
    deleteTwoFactorChallenge(challengeToken);
    return Response.json({ error: "Two-factor verification could not be completed." }, { status: 401 });
  }

  const throttle = await checkAuthThrottle("practitioner-2fa", pending.uid, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  if (!(await verifyTotpOrBackupCode(doc.ref, secret, code))) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }
  await clearAuthFailures(throttle.keyHash);
  deleteTwoFactorChallenge(challengeToken);

  await createPractitionerSession(pending.idToken);
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "This account does not have practitioner portal access." }, { status: 403 });
  return Response.json({ ok: true });
}
