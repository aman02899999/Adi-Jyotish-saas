import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { verifyPassword } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const [row] = await db.select({ passwordHash: practitioners.passwordHash }).from(practitioners).where(eq(practitioners.id, practitioner.id)).limit(1);
  const body = (await request.json()) as { password?: string };
  if (!verifyPassword(body.password ?? "", row?.passwordHash)) {
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }

  await db.update(practitioners).set({ totpEnabled: false, totpSecret: null, totpBackupCodes: null, updatedAt: new Date() }).where(eq(practitioners.id, practitioner.id));
  return Response.json({ ok: true });
}
