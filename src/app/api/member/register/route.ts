// TODO(core-auth-migration): this route still targets the retired Postgres member_users table
// and the pre-Firebase createMemberSession(id: number) signature. Member registration itself
// (as opposed to email verification, handled below) is owned by whoever migrates member
// sign-up to Firebase Auth — out of scope for the chat/messaging/admin-core migration pass.
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { createMemberSession } from "@/lib/member-auth";
import { hashPassword, normalizeEmail } from "@/lib/admin-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const throttle = await checkRateLimit("member-register", requestIp(request), 8, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { name?: string; email?: string; password?: string };
  const name = body.name?.trim().slice(0, 120) ?? "";
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";

  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
    return Response.json({ error: "Enter your name and a valid email address." }, { status: 400 });
  }
  if (password.length < 10 || password.length > 128) {
    return Response.json({ error: "Use a password between 10 and 128 characters." }, { status: 400 });
  }

  try {
    const [member] = await db.insert(memberUsers).values({
      name,
      email,
      passwordHash: hashPassword(password),
      lastLoginAt: new Date(),
    }).returning({ id: memberUsers.id, name: memberUsers.name });
    // Email verification is now Firebase Auth's sendEmailVerification(), triggered client-side
    // after sign-in, rather than this custom token email.
    await createMemberSession(member.id);
    return Response.json({ ok: true, member }, { status: 201 });
  } catch {
    return Response.json({ error: "An account with this email already exists." }, { status: 409 });
  }
}
