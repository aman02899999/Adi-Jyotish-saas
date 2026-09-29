import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createPractitionerInvite } from "@/lib/practitioner-invites";
import { getPractitionerById } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

// The [id] segment is the practitioner's slug (the practitioners collection's Firestore doc id).

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "schedule") && !hasAdminPermission(admin, "practitioners")) {
    return Response.json({ error: "Scheduling or Practitioners permission required." }, { status: 403 });
  }

  const { id: slug } = await params;
  if (!slug) return Response.json({ error: "Invalid practitioner id." }, { status: 400 });

  const practitioner = await getPractitionerById(slug);
  if (!practitioner) return Response.json({ error: "Practitioner not found." }, { status: 404 });
  // An AI persona has no person behind it; a portal login would let whoever holds it answer as the
  // persona and switch it offline, while the AI keeps replying in the same chats.
  if (practitioner.isAiPowered) return Response.json({ error: `${practitioner.name} is an AI astrologer and cannot be given a portal login.` }, { status: 409 });
  const email = practitioner.email;

  const token = await createPractitionerInvite(slug, admin.id);
  await recordAudit(admin, "practitioner.portal_invited", "practitioner", slug, { email });
  return Response.json({ ok: true, invitePath: `/practitioner/invite/${token}` });
}
