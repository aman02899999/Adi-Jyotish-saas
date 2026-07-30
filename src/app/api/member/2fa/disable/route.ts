import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { getCurrentMember } from "@/lib/member-auth";
import { verifyPassword } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const [row] = await db.select({ passwordHash: memberUsers.passwordHash }).from(memberUsers).where(eq(memberUsers.id, member.id)).limit(1);
  const body = (await request.json()) as { password?: string };
  if (!verifyPassword(body.password ?? "", row?.passwordHash)) {
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }

  await db.update(memberUsers).set({ totpEnabled: false, totpSecret: null, totpBackupCodes: null, updatedAt: new Date() }).where(eq(memberUsers.id, member.id));
  return Response.json({ ok: true });
}
