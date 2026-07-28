import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { createMemberSession } from "@/lib/member-auth";
import { hashPassword, normalizeEmail } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
    await createMemberSession(member.id);
    return Response.json({ ok: true, member }, { status: 201 });
  } catch {
    return Response.json({ error: "An account with this email already exists." }, { status: 409 });
  }
}
