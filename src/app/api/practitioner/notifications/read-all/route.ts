import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { markAllNotificationsRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function PUT() {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });
  await markAllNotificationsRead("practitioner", practitioner.id);
  return Response.json({ ok: true });
}
