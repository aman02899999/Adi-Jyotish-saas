import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { createAdminSession, normalizeEmail, recordAudit, verifyPassword } from "@/lib/admin-auth";
import { createTwoFactorChallenge } from "@/lib/admin-2fa";
import { and, eq } from "drizzle-orm";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; password?: string };
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";

  if (!email || !password || password.length > 128) {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const throttle = await checkAuthThrottle("admin-login", email, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const [admin] = await db.select().from(adminUsers).where(and(eq(adminUsers.email, email), eq(adminUsers.active, true))).limit(1);
  const passwordValid = verifyPassword(password, admin?.passwordHash);
  if (!admin || !passwordValid) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  await clearAuthFailures(throttle.keyHash);

  if (admin.totpEnabled) {
    const challengeToken = await createTwoFactorChallenge(admin.id);
    return Response.json({ requiresTotp: true, challengeToken });
  }

  await db.update(adminUsers).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(adminUsers.id, admin.id));
  const identity = { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
  await createAdminSession(admin.id);
  await recordAudit(identity, "auth.login", "administrator", admin.id);
  return Response.json({ ok: true, admin: identity });
}
