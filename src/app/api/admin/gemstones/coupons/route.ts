import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { CouponError, createCoupon, getAllCouponsAdmin, type CouponPayload } from "@/lib/gemstone-coupons";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });
  return Response.json(await getAllCouponsAdmin());
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const body = (await request.json()) as CouponPayload;
  try {
    const created = await createCoupon(body);
    await recordAudit(admin, "gemstone_coupon.created", "gemstone_coupon", created.id, { code: created.code });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof CouponError ? error.message : "Coupon could not be created." }, { status: 400 });
  }
}
