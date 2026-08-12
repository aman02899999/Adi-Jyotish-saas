import { db } from "@/lib/firestore";
import { getCurrentAdmin, recordAudit } from "@/lib/admin-auth";
import { verifyTotpOrBackupCode } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

/** Disabling 2FA requires proving the caller still holds the second factor (a live TOTP code or
 * a backup code) — there's no server-side password check available anymore since Firebase Auth
 * owns credential verification, so the code itself is the re-authentication step. */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });

  const ref = db.collection("adminUsers").doc(admin.id);
  const snap = await ref.get();
  const secret = snap.data()?.totpSecret as string | undefined;
  if (!secret || snap.data()?.totpEnabled !== true) return Response.json({ error: "Two-factor authentication is not enabled." }, { status: 409 });

  const body = (await request.json()) as { code?: string };
  if (!(await verifyTotpOrBackupCode(ref, secret, body.code ?? ""))) {
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }

  await ref.update({ totpEnabled: false, totpSecret: null, totpBackupCodes: null });
  await recordAudit(admin, "auth.2fa_disabled", "administrator", admin.id);
  return Response.json({ ok: true });
}
