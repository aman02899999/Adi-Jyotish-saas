import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
const allowedStatuses = new Set(["published", "hidden"]);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "reviews")) return Response.json({ error: "Reviews permission required." }, { status: 403 });
  const { id } = await params;

  const body = (await request.json()) as { status?: string };
  if (!body.status || !allowedStatuses.has(body.status)) return Response.json({ error: "Status must be published or hidden." }, { status: 400 });

  const ref = db.collection("practitionerReviews").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Review not found." }, { status: 404 });
  await ref.update({ status: body.status, updatedAt: FieldValue.serverTimestamp() });
  const updatedSnap = await ref.get();
  const updated = { id: updatedSnap.id, ...updatedSnap.data() };
  await recordAudit(admin, body.status === "hidden" ? "review.hidden" : "review.published", "practitioner_review", id, { practitionerId: (updatedSnap.data() as { practitionerId: string }).practitionerId });
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "reviews")) return Response.json({ error: "Reviews permission required." }, { status: 403 });
  const { id } = await params;

  const ref = db.collection("practitionerReviews").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Review not found." }, { status: 404 });
  const practitionerId = (snap.data() as { practitionerId: string }).practitionerId;
  await ref.delete();
  await recordAudit(admin, "review.deleted", "practitioner_review", id, { practitionerId });
  return Response.json({ ok: true, id });
}
