import { getCurrentMember, revokeMemberSession } from "@/lib/member-auth";
import { disableTwoFactor, getTwoFactorState, verifyTotpOrBackupCode, type TwoFactorAccount } from "@/lib/two-factor";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

/** Disabling 2FA requires proving the caller still holds the second factor (a live TOTP code or
 * a backup code) — there's no server-side password check available anymore since Firebase Auth
 * owns credential verification, so the code itself is the re-authentication step. */
export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const account: TwoFactorAccount = { role: "member", id: member.id };
  const state = await getTwoFactorState(account);
  const secret = state?.totpSecret;
  if (!state || !secret || !state.totpEnabled) return Response.json({ error: "Two-factor authentication is not enabled." }, { status: 409 });

  const throttle = await checkAuthThrottle("member-2fa-disable", member.id, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const body = (await request.json()) as { code?: string };
  if (!(await verifyTotpOrBackupCode(account, secret, body.code ?? ""))) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }
  await clearAuthFailures(throttle.keyHash);

  await disableTwoFactor(account);

  // Turning off 2FA is exactly the moment a stolen-but-still-valid session becomes most
  // dangerous — revoke every session (including this one) so anyone with a hijacked cookie,
  // including the legitimate owner's other devices, has to sign back in.
  await revokeMemberSession();
  return Response.json({ ok: true, sessionRevoked: true });
}
