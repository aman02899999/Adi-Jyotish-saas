import { db } from "@/lib/firestore";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { generateTotpSecret, getTotpQrDataUrl } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });

  const secret = generateTotpSecret();
  // Stored separately from totpSecret/totpEnabled - if 2FA is already on, a hijacked session must
  // not be able to disable or replace the active factor just by starting a re-enrollment. Only
  // /confirm (which requires a valid code for THIS secret) promotes it to the active one.
  await db.collection("adminUsers").doc(admin.id).update({ totpPendingSecret: secret });
  const qrDataUrl = await getTotpQrDataUrl(secret, admin.email);
  return Response.json({ secret, qrDataUrl });
}
