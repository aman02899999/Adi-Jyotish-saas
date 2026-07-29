import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitionerReviews } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
const allowedStatuses = new Set(["published", "hidden"]);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "reviews")) return Response.json({ error: "Reviews permission required." }, { status: 403 });
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid review id." }, { status: 400 });

  const body = (await request.json()) as { status?: string };
  if (!body.status || !allowedStatuses.has(body.status)) return Response.json({ error: "Status must be published or hidden." }, { status: 400 });

  const [updated] = await db.update(practitionerReviews).set({ status: body.status, updatedAt: new Date() }).where(eq(practitionerReviews.id, id)).returning();
  if (!updated) return Response.json({ error: "Review not found." }, { status: 404 });
  await recordAudit(admin, body.status === "hidden" ? "review.hidden" : "review.published", "practitioner_review", id, { practitionerId: updated.practitionerId });
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "reviews")) return Response.json({ error: "Reviews permission required." }, { status: 403 });
  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid review id." }, { status: 400 });

  const [deleted] = await db.delete(practitionerReviews).where(eq(practitionerReviews.id, id)).returning({ id: practitionerReviews.id, practitionerId: practitionerReviews.practitionerId });
  if (!deleted) return Response.json({ error: "Review not found." }, { status: 404 });
  await recordAudit(admin, "review.deleted", "practitioner_review", id, { practitionerId: deleted.practitionerId });
  return Response.json({ ok: true, id });
}
