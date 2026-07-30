import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { generateTotpSecret, getTotpQrDataUrl } from "@/lib/admin-2fa";

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });

  const secret = generateTotpSecret();
  await db.update(adminUsers).set({ totpSecret: secret, totpEnabled: false, updatedAt: new Date() }).where(eq(adminUsers.id, admin.id));
  const qrDataUrl = await getTotpQrDataUrl(secret, admin.email);
  return Response.json({ secret, qrDataUrl });
}
