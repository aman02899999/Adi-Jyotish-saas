import { getCurrentPractitioner } from "@/lib/practitioner-auth";
import { markNotificationRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function PUT(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) return Response.json({ error: "Practitioner sign-in required." }, { status: 401 });
  const { id } = await params;
  await markNotificationRead(id, "practitioner", practitioner.id);
  return Response.json({ ok: true });
}
