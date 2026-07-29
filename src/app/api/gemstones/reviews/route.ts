import { createReview, ReviewError } from "@/lib/gemstone-reviews";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  const body = (await request.json()) as { productId?: number; orderId?: number; reviewerName?: string; rating?: number; title?: string; body?: string };
  const productId = Number(body.productId);
  if (!Number.isInteger(productId) || productId <= 0) return Response.json({ error: "Invalid product." }, { status: 400 });

  try {
    const review = await createReview({
      productId,
      memberId: member?.id ?? null,
      orderId: body.orderId ?? null,
      reviewerName: body.reviewerName?.trim() || member?.name || "Anonymous",
      rating: Number(body.rating) || 0,
      title: body.title,
      body: body.body ?? "",
    });
    return Response.json({ ok: true, review }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof ReviewError ? error.message : "Review could not be submitted." }, { status: 400 });
  }
}
