import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { generateBackupCodes, verifyTotpCode } from "@/lib/two-factor";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const ref = db.collection("members").doc(member.id);
  const snap = await ref.get();
  const secret = snap.data()?.totpPendingSecret as string | undefined;
  if (!secret) return Response.json({ error: "Start enrollment before confirming a code." }, { status: 409 });

  const throttle = await checkAuthThrottle("member-2fa-confirm", member.id, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const body = (await request.json()) as { code?: string };
  if (!(await verifyTotpCode(secret, (body.code ?? "").trim()))) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }
  await clearAuthFailures(throttle.keyHash);

  const { codes, hashed } = generateBackupCodes();
  await ref.update({ totpSecret: secret, totpPendingSecret: FieldValue.delete(), totpEnabled: true, totpBackupCodes: hashed });
  return Response.json({ ok: true, backupCodes: codes });
}
