import { db } from "@/lib/firestore";
import { getCurrentAdmin, recordAudit, revokeCurrentSession } from "@/lib/admin-auth";
import { verifyTotpOrBackupCode } from "@/lib/two-factor";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

/** Disabling 2FA requires proving the caller still holds the second factor (a live TOTP code or
 * a backup code) — there's no server-side password check available anymore since Firebase Auth
 * owns credential verification, so the code itself is the re-authentication step. */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });

  const ref = db.collection("adminUsers").doc(admin.id);
  const snap = await ref.get();
  const secret = snap.data()?.totpSecret as string | undefined;
  if (!secret || snap.data()?.totpEnabled !== true) return Response.json({ error: "Two-factor authentication is not enabled." }, { status: 409 });

  const throttle = await checkAuthThrottle("admin-2fa-disable", admin.id, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const body = (await request.json()) as { code?: string };
  if (!(await verifyTotpOrBackupCode(ref, secret, body.code ?? ""))) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }
  await clearAuthFailures(throttle.keyHash);

  await ref.update({ totpEnabled: false, totpSecret: null, totpBackupCodes: null });
  await recordAudit(admin, "auth.2fa_disabled", "administrator", admin.id);

  // Turning off 2FA is exactly the moment a stolen-but-still-valid session becomes most
  // dangerous — revoke every session (including this one) so anyone with a hijacked cookie,
  // including the legitimate owner's other devices, has to sign back in.
  await revokeCurrentSession();
  return Response.json({ ok: true, sessionRevoked: true });
}
