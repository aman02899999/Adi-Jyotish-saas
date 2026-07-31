import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getAllServices, toSlug } from "@/lib/services";
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

export async function GET() {
  const rows = await getAllServices();
  return Response.json(rows);
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "services")) return Response.json({ error: "Catalogue permission required." }, { status: 403 });

  const body = (await request.json()) as ServicePayload;
  const title = body.title?.trim();
  const category = body.category?.trim();
  const description = body.description?.trim();

  if (!title || !category || !description) {
    return Response.json({ error: "Title, category, and description are required." }, { status: 400 });
  }

  const slug = `${toSlug(title)}-${Date.now().toString(36).slice(-5)}`;
  const doc = {
    title,
    slug,
    category,
    description,
    price: Math.max(0, Number(body.price) || 0),
    duration: Math.max(5, Number(body.duration) || 30),
    icon: body.icon || "sparkles",
    active: body.active ?? true,
    featured: body.featured ?? false,
  };
  const ref = db.collection("services").doc(slug);
  await ref.set({ ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });

  const created = { ...doc, id: slug, createdAt: new Date(), updatedAt: new Date() };
  await recordAudit(admin, "service.created", "service", created.id, { title: created.title });
  return Response.json(created, { status: 201 });
}
