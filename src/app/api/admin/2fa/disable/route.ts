import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { getCurrentAdmin, recordAudit, verifyPassword } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });

  const [row] = await db.select({ passwordHash: adminUsers.passwordHash }).from(adminUsers).where(eq(adminUsers.id, admin.id)).limit(1);
  const body = (await request.json()) as { password?: string };
  if (!verifyPassword(body.password ?? "", row?.passwordHash)) {
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }

  await db.update(adminUsers).set({ totpEnabled: false, totpSecret: null, totpBackupCodes: null, updatedAt: new Date() }).where(eq(adminUsers.id, admin.id));
  await recordAudit(admin, "auth.2fa_disabled", "administrator", admin.id);
  return Response.json({ ok: true });
}
