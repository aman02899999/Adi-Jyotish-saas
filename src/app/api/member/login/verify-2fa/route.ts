import { createMemberSession, getCurrentMember } from "@/lib/member-auth";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";
import { checkSignInCode, getTwoFactorState, peekTwoFactorChallenge, resolveTwoFactorAccount } from "@/lib/two-factor";
import { asText, readJsonBody } from "@/lib/request-body";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await readJsonBody(request)) as { challengeToken?: string; code?: string };
  const challengeToken = body.challengeToken ?? "";
  const code = (asText(body.code) ?? "").trim();
  if (!challengeToken || !code) return Response.json({ error: "Enter your 6-digit code." }, { status: 400 });

  const pending = peekTwoFactorChallenge("member", challengeToken);
  if (!pending) return Response.json({ error: "This code has expired. Sign in again." }, { status: 401 });

  const account = await resolveTwoFactorAccount("member", pending.uid);
  const state = account ? await getTwoFactorState(account) : null;
  const secret = state?.totpSecret;
  if (!account || !state || !secret || !state.totpEnabled) {
    return Response.json({ error: "Two-factor verification could not be completed." }, { status: 401 });
  }

  const throttle = await checkAuthThrottle("member-2fa", pending.uid, request);
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

  await createMemberSession(pending.idToken);
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Two-factor verification could not be completed." }, { status: 401 });
  return Response.json({ ok: true, onboardingComplete: member.onboardingComplete });
}
