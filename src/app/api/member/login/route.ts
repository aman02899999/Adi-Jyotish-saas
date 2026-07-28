import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { normalizeEmail, verifyPassword } from "@/lib/admin-auth";
import { createMemberSession } from "@/lib/member-auth";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; password?: string };
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";
  if (!email || !password || password.length > 128) {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const throttle = await checkAuthThrottle("member-login", email, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const [member] = await db.select().from(memberUsers).where(and(eq(memberUsers.email, email), eq(memberUsers.active, true))).limit(1);
  const passwordValid = verifyPassword(password, member?.passwordHash);
  if (!member || !passwordValid) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  await clearAuthFailures(throttle.keyHash);
  await db.update(memberUsers).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(memberUsers.id, member.id));
  await createMemberSession(member.id);
  return Response.json({ ok: true, onboardingComplete: member.onboardingComplete });
}
