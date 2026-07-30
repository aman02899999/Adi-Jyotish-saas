import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { memberSessions, memberUsers } from "@/db/schema";
import { hashPassword } from "@/lib/admin-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { digestToken } from "@/lib/recovery-tokens";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const throttle = await checkRateLimit("member-reset-password", requestIp(request), 8, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { token?: string; password?: string };
  const token = body.token?.trim() ?? "";
  const password = body.password ?? "";
  if (!token) return Response.json({ error: "This reset link is invalid." }, { status: 400 });
  if (password.length < 10 || password.length > 128) return Response.json({ error: "Use a password between 10 and 128 characters." }, { status: 400 });

  const [member] = await db.select({ id: memberUsers.id }).from(memberUsers)
    .where(and(eq(memberUsers.passwordResetTokenHash, digestToken(token)), gt(memberUsers.passwordResetExpiresAt, new Date())))
    .limit(1);
  if (!member) return Response.json({ error: "This reset link is invalid or has expired. Please request a new one." }, { status: 400 });

  await db.update(memberUsers).set({
    passwordHash: hashPassword(password),
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    updatedAt: new Date(),
  }).where(eq(memberUsers.id, member.id));

  // Reset invalidates every existing session — a stolen session is worth as much as a stolen password otherwise.
  await db.delete(memberSessions).where(eq(memberSessions.memberId, member.id));

  return Response.json({ ok: true });
}
