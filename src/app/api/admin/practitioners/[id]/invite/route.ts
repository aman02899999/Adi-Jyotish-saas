import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createPractitionerInvite } from "@/lib/practitioner-invites";

export const dynamic = "force-dynamic";

// The [id] segment is the practitioner's slug (the practitioners collection's Firestore doc id).

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "schedule")) return Response.json({ error: "Scheduling permission required." }, { status: 403 });

  const { id: slug } = await params;
  if (!slug) return Response.json({ error: "Invalid practitioner id." }, { status: 400 });

  const snap = await db.collection("practitioners").doc(slug).get();
  if (!snap.exists) return Response.json({ error: "Practitioner not found." }, { status: 404 });
  const email = (snap.data() as { email: string }).email;

  const token = await createPractitionerInvite(slug, admin.id);
  await recordAudit(admin, "practitioner.portal_invited", "practitioner", slug, { email });
  return Response.json({ ok: true, invitePath: `/practitioner/invite/${token}` });
}
