import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { generateTotpSecret, getTotpQrDataUrl } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const secret = generateTotpSecret();
  await db.collection("members").doc(member.id).update({ totpSecret: secret, totpEnabled: false });
  const qrDataUrl = await getTotpQrDataUrl(secret, member.email);
  return Response.json({ secret, qrDataUrl });
}
