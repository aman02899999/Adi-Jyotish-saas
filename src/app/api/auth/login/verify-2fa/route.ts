import { db } from "@/lib/firestore";
import { createAdminSession, getCurrentAdmin, recordAudit } from "@/lib/admin-auth";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";
import { deleteTwoFactorChallenge, peekTwoFactorChallenge, verifyTotpOrBackupCode } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { challengeToken?: string; code?: string };
  const challengeToken = body.challengeToken ?? "";
  const code = (body.code ?? "").trim();
  if (!challengeToken || !code) return Response.json({ error: "Enter your 6-digit code." }, { status: 400 });

  const pending = peekTwoFactorChallenge("admin", challengeToken);
  if (!pending) return Response.json({ error: "This code has expired. Sign in again." }, { status: 401 });

  const ref = db.collection("adminUsers").doc(pending.uid);
  const snap = await ref.get();
  const secret = snap.data()?.totpSecret as string | undefined;
  if (!snap.exists || !secret || snap.data()?.totpEnabled !== true) {
    deleteTwoFactorChallenge(challengeToken);
    return Response.json({ error: "Two-factor verification could not be completed." }, { status: 401 });
  }

  const throttle = await checkAuthThrottle("admin-2fa", pending.uid, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  if (!(await verifyTotpOrBackupCode(ref, secret, code))) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }
  await clearAuthFailures(throttle.keyHash);
  deleteTwoFactorChallenge(challengeToken);

  await createAdminSession(pending.idToken);
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "This account does not have administrator access." }, { status: 403 });

  await recordAudit(admin, "auth.login", "administrator", admin.id);
  return Response.json({ ok: true, admin });
}
