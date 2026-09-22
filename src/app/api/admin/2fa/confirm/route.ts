import { getCurrentAdmin, recordAudit } from "@/lib/admin-auth";
import { confirmTwoFactorEnrollment, generateBackupCodes, getTwoFactorState, verifyTotpCode } from "@/lib/two-factor";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });

  const account = { role: "admin" as const, id: admin.id };
  const state = await getTwoFactorState(account);
  const secret = state?.totpPendingSecret;
  if (!secret) return Response.json({ error: "Start enrollment before confirming a code." }, { status: 409 });

  const throttle = await checkAuthThrottle("admin-2fa-confirm", admin.id, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const body = (await request.json()) as { code?: string };
  if (!(await verifyTotpCode(secret, (body.code ?? "").trim()))) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }
  await clearAuthFailures(throttle.keyHash);

  const { codes, hashed } = generateBackupCodes();
  await confirmTwoFactorEnrollment(account, secret, hashed);
  await recordAudit(admin, "auth.2fa_enabled", "administrator", admin.id);
  return Response.json({ ok: true, backupCodes: codes });
}
