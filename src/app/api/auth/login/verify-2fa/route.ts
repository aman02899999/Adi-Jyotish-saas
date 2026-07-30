import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { createAdminSession, recordAudit } from "@/lib/admin-auth";
import { consumeBackupCode, deleteTwoFactorChallenge, peekTwoFactorChallenge, verifyTotpCode } from "@/lib/admin-2fa";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { challengeToken?: string; code?: string };
  const challengeToken = body.challengeToken ?? "";
  const code = (body.code ?? "").trim();
  if (!challengeToken || !code) return Response.json({ error: "Enter your 6-digit code." }, { status: 400 });

  const adminId = await peekTwoFactorChallenge(challengeToken);
  if (!adminId) return Response.json({ error: "This code has expired. Sign in again." }, { status: 401 });

  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminId)).limit(1);
  if (!admin || !admin.active || !admin.totpEnabled || !admin.totpSecret) {
    await deleteTwoFactorChallenge(challengeToken);
    return Response.json({ error: "Two-factor verification could not be completed." }, { status: 401 });
  }

  const throttle = await checkAuthThrottle("admin-2fa", admin.email, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const validTotp = await verifyTotpCode(admin.totpSecret, code);
  const validBackup = !validTotp && code.includes("-") && await consumeBackupCode(admin.id, code);
  if (!validTotp && !validBackup) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }

  await clearAuthFailures(throttle.keyHash);
  await deleteTwoFactorChallenge(challengeToken);
  await db.update(adminUsers).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(adminUsers.id, admin.id));
  const identity = { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
  await createAdminSession(admin.id);
  await recordAudit(identity, validBackup ? "auth.login_2fa_backup" : "auth.login_2fa", "administrator", admin.id);
  return Response.json({ ok: true, admin: identity });
}
