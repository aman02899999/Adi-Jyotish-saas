import { db } from "@/lib/firestore";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { generateTotpSecret, getTotpQrDataUrl } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST() {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });

  const secret = generateTotpSecret();
  await db.collection("practitioners").doc(practitioner.id).update({ totpSecret: secret, totpEnabled: false });
  const qrDataUrl = await getTotpQrDataUrl(secret, practitioner.email);
  return Response.json({ secret, qrDataUrl });
}
