import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { generateTotpSecret, getTotpQrDataUrl } from "@/lib/practitioner-2fa";

export const dynamic = "force-dynamic";

export async function POST() {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Please sign in first." }, { status: 401 });

  const secret = generateTotpSecret();
  await db.update(practitioners).set({ totpSecret: secret, totpEnabled: false, updatedAt: new Date() }).where(eq(practitioners.id, practitioner.id));
  const qrDataUrl = await getTotpQrDataUrl(secret, practitioner.email);
  return Response.json({ secret, qrDataUrl });
}
