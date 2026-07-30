import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { createPractitionerSession } from "@/lib/practitioner-auth";
import { consumeBackupCode, deleteTwoFactorChallenge, peekTwoFactorChallenge, verifyTotpCode } from "@/lib/practitioner-2fa";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { challengeToken?: string; code?: string };
  const challengeToken = body.challengeToken ?? "";
  const code = (body.code ?? "").trim();
  if (!challengeToken || !code) return Response.json({ error: "Enter your 6-digit code." }, { status: 400 });

  const practitionerId = await peekTwoFactorChallenge(challengeToken);
  if (!practitionerId) return Response.json({ error: "This code has expired. Sign in again." }, { status: 401 });

  const [practitioner] = await db.select().from(practitioners).where(eq(practitioners.id, practitionerId)).limit(1);
  if (!practitioner || !practitioner.active || !practitioner.totpEnabled || !practitioner.totpSecret) {
    await deleteTwoFactorChallenge(challengeToken);
    return Response.json({ error: "Two-factor verification could not be completed." }, { status: 401 });
  }

  const throttle = await checkAuthThrottle("practitioner-2fa", practitioner.email, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const validTotp = await verifyTotpCode(practitioner.totpSecret, code);
  const validBackup = !validTotp && code.includes("-") && await consumeBackupCode(practitioner.id, code);
  if (!validTotp && !validBackup) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }

  await clearAuthFailures(throttle.keyHash);
  await deleteTwoFactorChallenge(challengeToken);
  await db.update(practitioners).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(practitioners.id, practitioner.id));
  await createPractitionerSession(practitioner.id);
  return Response.json({ ok: true });
}
