import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { createMemberSession } from "@/lib/member-auth";
import { consumeBackupCode, deleteTwoFactorChallenge, peekTwoFactorChallenge, verifyTotpCode } from "@/lib/member-2fa";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { challengeToken?: string; code?: string };
  const challengeToken = body.challengeToken ?? "";
  const code = (body.code ?? "").trim();
  if (!challengeToken || !code) return Response.json({ error: "Enter your 6-digit code." }, { status: 400 });

  const memberId = await peekTwoFactorChallenge(challengeToken);
  if (!memberId) return Response.json({ error: "This code has expired. Sign in again." }, { status: 401 });

  const [member] = await db.select().from(memberUsers).where(eq(memberUsers.id, memberId)).limit(1);
  if (!member || !member.active || !member.totpEnabled || !member.totpSecret) {
    await deleteTwoFactorChallenge(challengeToken);
    return Response.json({ error: "Two-factor verification could not be completed." }, { status: 401 });
  }

  const throttle = await checkAuthThrottle("member-2fa", member.email, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const validTotp = await verifyTotpCode(member.totpSecret, code);
  const validBackup = !validTotp && code.includes("-") && await consumeBackupCode(member.id, code);
  if (!validTotp && !validBackup) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }

  await clearAuthFailures(throttle.keyHash);
  await deleteTwoFactorChallenge(challengeToken);
  await db.update(memberUsers).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(memberUsers.id, member.id));
  await createMemberSession(member.id);
  return Response.json({ ok: true, onboardingComplete: member.onboardingComplete });
}
