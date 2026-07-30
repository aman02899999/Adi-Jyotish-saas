import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { getCurrentMember } from "@/lib/member-auth";
import { generateBackupCodes, verifyTotpCode } from "@/lib/member-2fa";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const [row] = await db.select({ totpSecret: memberUsers.totpSecret }).from(memberUsers).where(eq(memberUsers.id, member.id)).limit(1);
  if (!row?.totpSecret) return Response.json({ error: "Start enrollment before confirming a code." }, { status: 409 });

  const body = (await request.json()) as { code?: string };
  if (!(await verifyTotpCode(row.totpSecret, (body.code ?? "").trim()))) {
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }

  const { codes, hashed } = generateBackupCodes();
  await db.update(memberUsers).set({ totpEnabled: true, totpBackupCodes: hashed, updatedAt: new Date() }).where(eq(memberUsers.id, member.id));
  return Response.json({ ok: true, backupCodes: codes });
}
