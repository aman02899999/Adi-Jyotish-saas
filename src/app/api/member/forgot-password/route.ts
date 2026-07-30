import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { normalizeEmail } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { issueToken, passwordResetEmailHtml, PASSWORD_RESET_MINUTES } from "@/lib/recovery-tokens";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const throttle = await checkRateLimit("member-forgot-password", requestIp(request), 5, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { email?: string };
  const email = normalizeEmail(body.email ?? "");
  const generic = { ok: true, message: "If that email has an account, a reset link is on its way." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json(generic);

  const [member] = await db.select({ id: memberUsers.id, name: memberUsers.name }).from(memberUsers).where(eq(memberUsers.email, email)).limit(1);
  if (member) {
    const { token, hash } = issueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000);
    await db.update(memberUsers).set({ passwordResetTokenHash: hash, passwordResetExpiresAt: expiresAt }).where(eq(memberUsers.id, member.id));
    const resetUrl = new URL(`/reset-password?token=${token}`, getSiteUrl()).toString();
    await sendEmail({ to: email, subject: "Reset your Jyotish password", html: passwordResetEmailHtml({ name: member.name, resetUrl }) });
  }

  return Response.json(generic);
}
