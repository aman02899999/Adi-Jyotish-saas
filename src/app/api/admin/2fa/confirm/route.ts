import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { getCurrentAdmin, recordAudit } from "@/lib/admin-auth";
import { generateBackupCodes, verifyTotpCode } from "@/lib/admin-2fa";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });

  const [row] = await db.select({ totpSecret: adminUsers.totpSecret }).from(adminUsers).where(eq(adminUsers.id, admin.id)).limit(1);
  if (!row?.totpSecret) return Response.json({ error: "Start enrollment before confirming a code." }, { status: 409 });

  const body = (await request.json()) as { code?: string };
  if (!(await verifyTotpCode(row.totpSecret, (body.code ?? "").trim()))) {
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }

  const { codes, hashed } = generateBackupCodes();
  await db.update(adminUsers).set({ totpEnabled: true, totpBackupCodes: hashed, updatedAt: new Date() }).where(eq(adminUsers.id, admin.id));
  await recordAudit(admin, "auth.2fa_enabled", "administrator", admin.id);
  return Response.json({ ok: true, backupCodes: codes });
}
