import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { normalizeEmail } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { issueToken, passwordResetEmailHtml, PASSWORD_RESET_MINUTES } from "@/lib/recovery-tokens";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const throttle = await checkRateLimit("practitioner-forgot-password", requestIp(request), 5, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { email?: string };
  const email = normalizeEmail(body.email ?? "");
  const generic = { ok: true, message: "If that email has a practitioner account, a reset link is on its way." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json(generic);

  const [practitioner] = await db.select({ id: practitioners.id, name: practitioners.name }).from(practitioners).where(eq(practitioners.email, email)).limit(1);
  if (practitioner) {
    const { token, hash } = issueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000);
    await db.update(practitioners).set({ passwordResetTokenHash: hash, passwordResetExpiresAt: expiresAt }).where(eq(practitioners.id, practitioner.id));
    const resetUrl = new URL(`/practitioner/reset-password?token=${token}`, getSiteUrl()).toString();
    await sendEmail({ to: email, subject: "Reset your Jyotish practitioner password", html: passwordResetEmailHtml({ name: practitioner.name, resetUrl }) });
  }

  return Response.json(generic);
}
