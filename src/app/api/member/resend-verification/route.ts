import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { getCurrentMember } from "@/lib/member-auth";
import { sendEmail } from "@/lib/email";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { emailVerificationEmailHtml, EMAIL_VERIFICATION_HOURS, issueToken } from "@/lib/recovery-tokens";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const throttle = await checkRateLimit("member-resend-verification", requestIp(request), 3, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const { token, hash } = issueToken();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_HOURS * 60 * 60 * 1000);
  await db.update(memberUsers).set({ emailVerificationTokenHash: hash, emailVerificationExpiresAt: expiresAt }).where(eq(memberUsers.id, member.id));
  const verifyUrl = new URL(`/api/member/verify-email?token=${token}`, getSiteUrl()).toString();
  await sendEmail({ to: member.email, subject: "Confirm your Jyotish email", html: emailVerificationEmailHtml({ name: member.name, verifyUrl }) });

  return Response.json({ ok: true });
}
