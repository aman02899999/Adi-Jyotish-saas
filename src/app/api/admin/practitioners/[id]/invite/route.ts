import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { createPractitionerInvite } from "@/lib/practitioner-invites";

export const dynamic = "force-dynamic";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "schedule")) return Response.json({ error: "Scheduling permission required." }, { status: 403 });

  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Invalid practitioner id." }, { status: 400 });

  const [practitioner] = await db.select({ id: practitioners.id, email: practitioners.email }).from(practitioners).where(eq(practitioners.id, id)).limit(1);
  if (!practitioner) return Response.json({ error: "Practitioner not found." }, { status: 404 });

  const token = await createPractitionerInvite(id, admin.id);
  await recordAudit(admin, "practitioner.portal_invited", "practitioner", id, { email: practitioner.email });
  return Response.json({ ok: true, invitePath: `/practitioner/invite/${token}` });
}
