import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { CartValidationError, getOrderById, getOrderItems, OrderNotFoundError, updateOrderStatus } from "@/lib/gemstone-orders";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid order id." }, { status: 400 });

  const order = await getOrderById(id);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
  const items = await getOrderItems(id);
  return Response.json({ order, items });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid order id." }, { status: 400 });

  const body = (await request.json()) as { status?: string };
  const status = body.status;
  const allowed = ["pending", "processing", "packed", "shipped", "delivered", "cancelled", "refunded"];
  if (!status || !allowed.includes(status)) return Response.json({ error: "Invalid status." }, { status: 400 });

  try {
    const updated = await updateOrderStatus(id, status);
    await recordAudit(admin, "gemstone_order.status_updated", "gemstone_order", id, { status });
    return Response.json(updated);
  } catch (error) {
    if (error instanceof OrderNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof CartValidationError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "Order status could not be updated." }, { status: 400 });
  }
}
