import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { deleteReview, moderateReview, ReviewError } from "@/lib/gemstone-reviews";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid review id." }, { status: 400 });

  const body = (await request.json()) as { status?: string };
  if (body.status !== "published" && body.status !== "hidden") return Response.json({ error: "Invalid status." }, { status: 400 });

  try {
    const updated = await moderateReview(id, body.status);
    await recordAudit(admin, "gemstone_review.moderated", "gemstone_review", id, { status: body.status });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof ReviewError ? error.message : "Review could not be updated." }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid review id." }, { status: 400 });

  await deleteReview(id);
  await recordAudit(admin, "gemstone_review.deleted", "gemstone_review", id);
  return Response.json({ ok: true });
}
