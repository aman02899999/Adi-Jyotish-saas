import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type ServicePayload = {
  title?: string;
  category?: string;
  description?: string;
  price?: number;
  duration?: number;
  icon?: string;
  active?: boolean;
  featured?: boolean;
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "services")) return Response.json({ error: "Catalogue permission required." }, { status: 403 });

  const { id } = await params;
  const body = (await request.json()) as ServicePayload;
  const title = body.title?.trim();
  const category = body.category?.trim();
  const description = body.description?.trim();
  if (!title || !category || !description) {
    return Response.json({ error: "Title, category, and description are required." }, { status: 400 });
  }

  const ref = db.collection("services").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Service not found." }, { status: 404 });

  const patch = {
    title,
    category,
    description,
    price: Math.max(0, Number(body.price) || 0),
    duration: Math.max(5, Number(body.duration) || 30),
    icon: body.icon || "sparkles",
    active: body.active ?? true,
    featured: body.featured ?? false,
  };
  await ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });

  const updated = { ...patch, id, slug: snap.data()?.slug, updatedAt: new Date() };
  await recordAudit(admin, "service.updated", "service", updated.id, { title: updated.title, active: updated.active, featured: updated.featured });
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "services")) return Response.json({ error: "Catalogue permission required." }, { status: 403 });

  const { id } = await params;
  const ref = db.collection("services").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Service not found." }, { status: 404 });
  const title = snap.data()?.title as string;
  await ref.delete();
  await recordAudit(admin, "service.deleted", "service", id, { title });
  return Response.json({ ok: true, id });
}
