import { db } from "@/lib/firestore";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { generateTotpSecret, getTotpQrDataUrl } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });

  const secret = generateTotpSecret();
  await db.collection("adminUsers").doc(admin.id).update({ totpSecret: secret, totpEnabled: false });
  const qrDataUrl = await getTotpQrDataUrl(secret, admin.email);
  return Response.json({ secret, qrDataUrl });
}
