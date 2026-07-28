import { db } from "@/db";
import { services } from "@/db/schema";
import { eq } from "drizzle-orm";
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

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "services")) return Response.json({ error: "Catalogue permission required." }, { status: 403 });

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Invalid service id." }, { status: 400 });

  const body = (await request.json()) as ServicePayload;
  const title = body.title?.trim();
  const category = body.category?.trim();
  const description = body.description?.trim();
  if (!title || !category || !description) {
    return Response.json({ error: "Title, category, and description are required." }, { status: 400 });
  }

  const [updated] = await db
    .update(services)
    .set({
      title,
      category,
      description,
      price: Math.max(0, Number(body.price) || 0),
      duration: Math.max(5, Number(body.duration) || 30),
      icon: body.icon || "sparkles",
      active: body.active ?? true,
      featured: body.featured ?? false,
      updatedAt: new Date(),
    })
    .where(eq(services.id, id))
    .returning();

  if (!updated) return Response.json({ error: "Service not found." }, { status: 404 });
  await recordAudit(admin, "service.updated", "service", updated.id, { title: updated.title, active: updated.active, featured: updated.featured });
  return Response.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "services")) return Response.json({ error: "Catalogue permission required." }, { status: 403 });

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Invalid service id." }, { status: 400 });

  const [deleted] = await db.delete(services).where(eq(services.id, id)).returning({ id: services.id, title: services.title });
  if (!deleted) return Response.json({ error: "Service not found." }, { status: 404 });
  await recordAudit(admin, "service.deleted", "service", deleted.id, { title: deleted.title });
  return Response.json({ ok: true, id: deleted.id });
}
