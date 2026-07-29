import { getOrderByNumberScoped, getOrderItems } from "@/lib/gemstone-orders";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderNumber = searchParams.get("orderNumber")?.trim();
  const email = searchParams.get("email")?.trim();
  if (!orderNumber) return Response.json({ error: "Order number is required." }, { status: 400 });

  const member = await getCurrentMember();
  const order = await getOrderByNumberScoped(orderNumber, { memberId: member?.id, guestEmail: email });
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  const items = await getOrderItems(order.id);
  return Response.json({ order, items });
}
