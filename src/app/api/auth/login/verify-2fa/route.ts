import { createAdminSession, getCurrentAdmin, recordAudit } from "@/lib/admin-auth";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";
import { checkSignInCode, getTwoFactorState, peekTwoFactorChallenge, resolveTwoFactorAccount } from "@/lib/two-factor";
import { asText, readJsonBody } from "@/lib/request-body";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await readJsonBody(request)) as { challengeToken?: string; code?: string };
  const challengeToken = body.challengeToken ?? "";
  const code = (asText(body.code) ?? "").trim();
  if (!challengeToken || !code) return Response.json({ error: "Enter your 6-digit code." }, { status: 400 });

  const pending = peekTwoFactorChallenge("admin", challengeToken);
  if (!pending) return Response.json({ error: "This code has expired. Sign in again." }, { status: 401 });

  const account = await resolveTwoFactorAccount("admin", pending.uid);
  const state = account ? await getTwoFactorState(account) : null;
  const secret = state?.totpSecret;
  if (!account || !state || !secret || !state.totpEnabled) {
    return Response.json({ error: "Two-factor verification could not be completed." }, { status: 401 });
  }

  const throttle = await checkAuthThrottle("admin-2fa", pending.uid, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const verdict = await checkSignInCode(account, secret, code);
  if (!verdict.ok) {
    await recordAuthFailure(throttle.keyHash);
    if (verdict.retryAfter) {
      return Response.json({ error: "Too many incorrect codes. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } });
    }
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }
  await clearAuthFailures(throttle.keyHash);

  await createAdminSession(pending.idToken);
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "This account does not have administrator access." }, { status: 403 });

  await recordAudit(admin, "auth.login", "administrator", admin.id);
  return Response.json({ ok: true, admin });
}
