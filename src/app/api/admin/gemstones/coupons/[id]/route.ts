import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { CouponError, updateCoupon, type CouponPayload } from "@/lib/gemstone-coupons";

export const dynamic = "force-dynamic";
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "gemstones")) return Response.json({ error: "Gemstones permission required." }, { status: 403 });

  const { id: raw } = await params;
  const id = parseId(raw);
  if (!id) return Response.json({ error: "Invalid coupon id." }, { status: 400 });

  const body = (await request.json()) as CouponPayload;
  try {
    const updated = await updateCoupon(id, body);
    await recordAudit(admin, "gemstone_coupon.updated", "gemstone_coupon", id, { code: updated.code, active: updated.active });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof CouponError ? error.message : "Coupon could not be updated." }, { status: 400 });
  }
}
