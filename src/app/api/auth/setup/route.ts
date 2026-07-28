import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import {
  createAdminSession,
  getAdminCount,
  hashPassword,
  normalizeEmail,
  recordAudit,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (await getAdminCount() > 0) {
    return Response.json({ error: "Administrator setup is already complete." }, { status: 403 });
  }

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
    const [created] = await db.insert(adminUsers).values({
      name,
      email,
      passwordHash: hashPassword(password),
      role: "owner",
      lastLoginAt: new Date(),
    }).returning({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email, role: adminUsers.role });

    await createAdminSession(created.id);
    await recordAudit(created, "account.created", "administrator", created.id, { role: created.role });
    return Response.json({ ok: true, admin: created }, { status: 201 });
  } catch {
    return Response.json({ error: "Administrator setup could not be completed." }, { status: 409 });
  }
}
