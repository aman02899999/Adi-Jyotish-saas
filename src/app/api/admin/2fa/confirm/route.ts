import { db } from "@/lib/firestore";
import { getCurrentAdmin, recordAudit } from "@/lib/admin-auth";
import { generateBackupCodes, verifyTotpCode } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });

  const ref = db.collection("adminUsers").doc(admin.id);
  const snap = await ref.get();
  const secret = snap.data()?.totpSecret as string | undefined;
  if (!secret) return Response.json({ error: "Start enrollment before confirming a code." }, { status: 409 });

  const body = (await request.json()) as { code?: string };
  if (!(await verifyTotpCode(secret, (body.code ?? "").trim()))) {
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }

  const { codes, hashed } = generateBackupCodes();
  await ref.update({ totpEnabled: true, totpBackupCodes: hashed });
  await recordAudit(admin, "auth.2fa_enabled", "administrator", admin.id);
  return Response.json({ ok: true, backupCodes: codes });
}
