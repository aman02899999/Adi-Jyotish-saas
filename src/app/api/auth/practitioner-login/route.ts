import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { normalizeEmail, verifyPassword } from "@/lib/admin-auth";
import { createPractitionerSession } from "@/lib/practitioner-auth";
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from "@/lib/auth-throttle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";
  if (!email || !password || password.length > 128) {
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const throttle = await checkAuthThrottle("practitioner-login", email, request);
  if (!throttle.allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } });

  const [practitioner] = await db.select().from(practitioners).where(and(eq(practitioners.email, email), eq(practitioners.active, true))).limit(1);
  const passwordValid = practitioner?.passwordHash ? verifyPassword(password, practitioner.passwordHash) : verifyPassword(password, null);
  if (!practitioner || !practitioner.passwordHash || !passwordValid) {
    await recordAuthFailure(throttle.keyHash);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  await clearAuthFailures(throttle.keyHash);
  await db.update(practitioners).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(practitioners.id, practitioner.id));
  await createPractitionerSession(practitioner.id);
  return Response.json({ ok: true });
}
