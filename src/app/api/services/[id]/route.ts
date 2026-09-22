import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import {
  countBookingsForServiceInSupabase,
  deleteServiceInSupabase,
  getServiceByIdInSupabase,
  updateServiceInSupabase,
} from "@/lib/services-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

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

  let slug: string | null;
  if (isSupabaseCutoverActive()) {
    const existing = await getServiceByIdInSupabase(id);
    if (!existing) return Response.json({ error: "Service not found." }, { status: 404 });
    slug = existing.slug;
  } else {
    const snap = await db.collection("services").doc(id).get();
    if (!snap.exists) return Response.json({ error: "Service not found." }, { status: 404 });
    slug = (snap.data()?.slug as string | undefined) ?? null;
  }

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
  if (isSupabaseCutoverActive()) {
    await updateServiceInSupabase(id, patch);
  } else {
    await db.collection("services").doc(id).update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
  }

  const updated = { ...patch, id, slug, updatedAt: new Date() };
  await recordAudit(admin, "service.updated", "service", updated.id, { title: updated.title, active: updated.active, featured: updated.featured });
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "services")) return Response.json({ error: "Catalogue permission required." }, { status: 403 });

  const { id } = await params;

  let title: string;
  if (isSupabaseCutoverActive()) {
    const existing = await getServiceByIdInSupabase(id);
    if (!existing) return Response.json({ error: "Service not found." }, { status: 404 });
    title = existing.title;

    // bookings.service_id is a foreign key with NO ACTION, so the delete below would fail
    // with 23503 and surface as a 500. Refusing up front is the block-or-resolve pattern
    // the rest of the catalogue uses, and it beats a stack trace.
    const bookings = await countBookingsForServiceInSupabase(id);
    if (bookings > 0) {
      return Response.json({
        error: `${bookings} booking${bookings === 1 ? "" : "s"} still reference this service. Deactivate it instead of deleting it, so those bookings keep a valid service.`,
      }, { status: 409 });
    }
    await deleteServiceInSupabase(id);
  } else {
    const snap = await db.collection("services").doc(id).get();
    if (!snap.exists) return Response.json({ error: "Service not found." }, { status: 404 });
    title = snap.data()?.title as string;
    await db.collection("services").doc(id).delete();
  }
  await recordAudit(admin, "service.deleted", "service", id, { title });
  return Response.json({ ok: true, id });
}
