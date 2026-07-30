import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { generateBackupCodes, verifyTotpCode } from "@/lib/practitioner-2fa";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const [row] = await db.select({ totpSecret: practitioners.totpSecret }).from(practitioners).where(eq(practitioners.id, practitioner.id)).limit(1);
  if (!row?.totpSecret) return Response.json({ error: "Start enrollment before confirming a code." }, { status: 409 });

  const body = (await request.json()) as { code?: string };
  if (!(await verifyTotpCode(row.totpSecret, (body.code ?? "").trim()))) {
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }

  const { codes, hashed } = generateBackupCodes();
  await db.update(practitioners).set({ totpEnabled: true, totpBackupCodes: hashed, updatedAt: new Date() }).where(eq(practitioners.id, practitioner.id));
  return Response.json({ ok: true, backupCodes: codes });
}
