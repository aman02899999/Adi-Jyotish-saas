import { db } from "@/lib/firestore";
import {
  AccountDeletionBlockedError,
  deleteMemberAccount,
  getDeletionBlockers,
} from "@/lib/account-deletion";
import { DELETE_CONFIRMATION_PHRASE } from "@/lib/account-privacy";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";
import { getCurrentMember, revokeMemberSession } from "@/lib/member-auth";
import { verifyTotpOrBackupCode } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/** Pre-flight: tells the account UI whether deletion is currently possible and what stands in
 * the way (wallet balance, live chat) so the member sees the blockers before typing anything. */
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  const blockers = await getDeletionBlockers(member);
  return Response.json({ blockers, twoFactorRequired: member.totpEnabled, confirmationPhrase: DELETE_CONFIRMATION_PHRASE });
}

/**
 * Irreversibly deletes the signed-in member's account — the "right to erasure" the privacy
 * policy promises, self-service. Intent is proven by a typed confirmation phrase, plus a live
 * TOTP/backup code when 2FA is enabled (same re-authentication standard as disabling 2FA:
 * Firebase Auth owns the password, so the second factor is the only server-verifiable proof).
 */
export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const throttle = await checkAuthThrottle("member-delete-account", member.id, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const body = (await request.json().catch(() => ({}))) as { confirmation?: string; code?: string };

  if ((body.confirmation ?? "").trim() !== DELETE_CONFIRMATION_PHRASE) {
    return Response.json({ error: `Type ${DELETE_CONFIRMATION_PHRASE} exactly to confirm.` }, { status: 400 });
  }

  if (member.totpEnabled) {
    const ref = db.collection("members").doc(member.id);
    const snap = await ref.get();
    const secret = snap.data()?.totpSecret as string | undefined;
    if (!secret || !(await verifyTotpOrBackupCode(ref, secret, body.code ?? ""))) {
      await recordAuthFailure(throttle.keyHash);
      return Response.json({ error: "That two-factor code is incorrect." }, { status: 401 });
    }
  }
  await clearAuthFailures(throttle.keyHash);

  try {
    await deleteMemberAccount(member);
  } catch (error) {
    if (error instanceof AccountDeletionBlockedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  // The Auth user is gone; clear the session cookie so the browser doesn't keep presenting a
  // dead credential.
  await revokeMemberSession();
  return Response.json({ ok: true });
}
