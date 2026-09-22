import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { confirmTwoFactorEnrollment, generateBackupCodes, getTwoFactorState, verifyTotpCode } from "@/lib/two-factor";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const account = { role: "practitioner" as const, id: practitioner.id };
  const state = await getTwoFactorState(account);
  const secret = state?.totpPendingSecret;
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
  await confirmTwoFactorEnrollment(account, secret, hashed);
  return Response.json({ ok: true, backupCodes: codes });
}
