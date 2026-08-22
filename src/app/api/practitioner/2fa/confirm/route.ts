import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { generateBackupCodes, verifyTotpCode } from "@/lib/two-factor";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const ref = db.collection("practitioners").doc(practitioner.id);
  const snap = await ref.get();
  const secret = snap.data()?.totpPendingSecret as string | undefined;
  if (!secret) return Response.json({ error: "Start enrollment before confirming a code." }, { status: 409 });

  const throttle = await checkAuthThrottle("practitioner-2fa-confirm", practitioner.id, request);
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
