import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { getCurrentMember } from "@/lib/member-auth";
import { generateTotpSecret, getTotpQrDataUrl } from "@/lib/member-2fa";

export const dynamic = "force-dynamic";

export async function POST() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const secret = generateTotpSecret();
  await db.update(memberUsers).set({ totpSecret: secret, totpEnabled: false, updatedAt: new Date() }).where(eq(memberUsers.id, member.id));
  const qrDataUrl = await getTotpQrDataUrl(secret, member.email);
  return Response.json({ secret, qrDataUrl });
}
