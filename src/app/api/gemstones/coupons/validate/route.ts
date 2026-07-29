import { CouponError, validateCoupon } from "@/lib/gemstone-coupons";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { code?: string; subtotal?: number };
  const code = body.code?.trim();
  const subtotal = Number(body.subtotal) || 0;
  if (!code) return Response.json({ error: "Enter a coupon code." }, { status: 400 });

  try {
    const { coupon, discountAmount } = await validateCoupon(code, subtotal);
    return Response.json({ ok: true, code: coupon.code, discountAmount });
  } catch (error) {
    return Response.json({ error: error instanceof CouponError ? error.message : "Coupon could not be applied." }, { status: 400 });
  }
}
