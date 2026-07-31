import { getCurrentMember } from "@/lib/member-auth";
import { getWishlistWithProducts, toggleWishlist } from "@/lib/gemstone-wishlist";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  return Response.json({ products: await getWishlistWithProducts(member.id) });
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const body = (await request.json()) as { productId?: string };
  const productId = body.productId?.trim();
  if (!productId) return Response.json({ error: "Invalid product id." }, { status: 400 });

  const result = await toggleWishlist(member.id, productId);
  return Response.json(result);
}
